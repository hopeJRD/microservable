from flask import Flask, request, jsonify
import boto3
import yaml
import docker

app = Flask(__name__)

@app.route('/api/deploy', methods=['POST'])
def deploy_to_aws():
    data = request.json
    
    # Process the graph data
    services = process_graph_data(data)
    
    # Create Docker images
    image_uris = create_docker_images(services)
    
    # Deploy to AWS
    stack_id = deploy_to_aws_ecs(services, image_uris)
    
    return jsonify({"message": "Deployment started", "stackId": stack_id})

def process_graph_data(data):
    services = {}
    for element in data['graph']['cells']:
        if element['type'] == 'custom.Service':
            service_id = element['id']
            service_data = data['services'][service_id]
            services[service_id] = {
                'name': service_data['name'],
                'config': yaml.safe_load(service_data['yaml'])
            }
    return services

def create_docker_images(services):
    client = docker.from_env()
    ecr_client = boto3.client('ecr')
    
    image_uris = {}
    for service_id, service in services.items():
        # Create a Dockerfile
        dockerfile_content = f"""
        FROM python:3.9-slim
        WORKDIR /app
        COPY requirements.txt .
        RUN pip install --no-cache-dir -r requirements.txt
        COPY . .
        CMD ["python", "app.py"]
        """
        
        # Build the Docker image
        image, build_logs = client.images.build(
            path=".",
            dockerfile=dockerfile_content,
            tag=f"{service['name']}:latest"
        )
        
        # Push to ECR
        repository_name = f"{service['name']}-repo"
        try:
            ecr_client.create_repository(repositoryName=repository_name)
        except ecr_client.exceptions.RepositoryAlreadyExistsException:
            pass
        
        auth_token = ecr_client.get_authorization_token()
        ecr_url = auth_token['authorizationData'][0]['proxyEndpoint']
        
        client.images.push(f"{ecr_url}/{repository_name}:latest")
        
        image_uris[service_id] = f"{ecr_url}/{repository_name}:latest"
    
    return image_uris

def deploy_to_aws_ecs(services, image_uris):
    cloudformation = boto3.client('cloudformation')
    
    template = {
        "AWSTemplateFormatVersion": "2010-09-09",
        "Resources": {
            "ECSCluster": {
                "Type": "AWS::ECS::Cluster",
                "Properties": {
                    "ClusterName": "MicroservicesCluster"
                }
            }
        }
    }
    
    for service_id, service in services.items():
        task_definition = {
            "Type": "AWS::ECS::TaskDefinition",
            "Properties": {
                "Family": service['name'],
                "ContainerDefinitions": [
                    {
                        "Name": service['name'],
                        "Image": image_uris[service_id],
                        "PortMappings": [
                            {
                                "ContainerPort": service['config'].get('port', 8080),
                                "Protocol": "tcp"
                            }
                        ],
                        "Environment": [
                            {"Name": k, "Value": v}
                            for k, v in service['config'].get('environment', {}).items()
                        ]
                    }
                ]
            }
        }
        
        ecs_service = {
            "Type": "AWS::ECS::Service",
            "Properties": {
                "ServiceName": service['name'],
                "Cluster": {"Ref": "ECSCluster"},
                "TaskDefinition": {"Ref": f"{service['name']}TaskDefinition"},
                "DesiredCount": 1,
                "LaunchType": "FARGATE",
                "NetworkConfiguration": {
                    "AwsvpcConfiguration": {
                        "AssignPublicIp": "ENABLED",
                        "Subnets": ["<subnet-id-1>", "<subnet-id-2>"],
                        "SecurityGroups": ["<security-group-id>"]
                    }
                }
            }
        }
        
        template["Resources"][f"{service['name']}TaskDefinition"] = task_definition
        template["Resources"][f"{service['name']}Service"] = ecs_service
    
    stack_name = "MicroservicesStack"
    response = cloudformation.create_stack(
        StackName=stack_name,
        TemplateBody=yaml.dump(template),
        Capabilities=['CAPABILITY_IAM']
    )
    
    return response['StackId']

if __name__ == '__main__':
    app.run(debug=True)

