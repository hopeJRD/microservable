const graph = new joint.dia.Graph();
const paper = new joint.dia.Paper({
    el: document.getElementById('paper'),
    model: graph,
    width: '100%',
    height: '100%',
    gridSize: 10,
    drawGrid: true,
    background: {
        color: 'rgba(0, 0, 0, 0.1)'
    },
    interactive: { vertexAdd: false }
});

let serviceIndex = 1;
let editor;
let currentService = null;

// Custom service shape
const ServiceShape = joint.dia.Element.define('custom.Service', {
    attrs: {
        body: {
            refWidth: '100%',
            refHeight: '100%',
            strokeWidth: 2,
            rx: 10,
            ry: 10
        },
        label: {
            textVerticalAnchor: 'middle',
            textAnchor: 'middle',
            refX: '50%',
            refY: '50%',
            fontSize: 14,
            fill: '#ffffff'
        }
    }
}, {
    markup: [{
        tagName: 'rect',
        selector: 'body'
    }, {
        tagName: 'text',
        selector: 'label'
    }]
});

// Custom link for different communication types
const CommunicationLink = joint.dia.Link.define('custom.CommunicationLink', {
    attrs: {
        line: {
            connection: true,
            stroke: '#333333',
            strokeWidth: 2,
            targetMarker: {
                type: 'path',
                d: 'M 10 -5 0 0 10 5 Z'
            }
        },
        wrapper: {
            connection: true,
            strokeWidth: 10,
            strokeLinejoin: 'round'
        },
        label: {
            fontSize: 12,
            fill: '#ffffff',
            textAnchor: 'middle',
            textVerticalAnchor: 'middle',
            textPath: {
                d: 'M 0 -10 0 10',
                startOffset: '50%'
            }
        }
    }
}, {
    markup: [{
        tagName: 'path',
        selector: 'wrapper',
        attributes: {
            'fill': 'none',
            'cursor': 'pointer',
            'stroke': 'transparent'
        }
    }, {
        tagName: 'path',
        selector: 'line',
        attributes: {
            'fill': 'none',
            'pointer-events': 'none'
        }
    }, {
        tagName: 'text',
        selector: 'label',
        attributes: {
            'pointer-events': 'none'
        }
    }]
});

function createService(x, y) {
    const service = new ServiceShape({
        position: { x, y },
        size: { width: 120, height: 60 },
        attrs: {
            body: {
                fill: '#8b5cf6',
                stroke: '#6b46c1'
            },
            label: {
                text: `Service ${serviceIndex}`
            }
        }
    });

    service.prop('config', {
        name: `Service ${serviceIndex}`,
        description: '',
        yaml: `name: Service ${serviceIndex}\nport: 8080\n`
    });

    serviceIndex++;
    return service;
}

function createCommunicationLink(source, target, type) {
    const linkAttrs = {
        'REST API': { line: { stroke: '#3b82f6' }, label: { text: 'REST' } },
        'gRPC': { line: { stroke: '#10b981' }, label: { text: 'gRPC' } },
        'Message Broker': { line: { stroke: '#f59e0b' }, label: { text: 'Queue' } },
        'GraphQL': { line: { stroke: '#ec4899' }, label: { text: 'GraphQL' } }
    };

    return new CommunicationLink({
        source: { id: source.id },
        target: { id: target.id },
        attrs: linkAttrs[type]
    });
}

let selectedLinkType = null;
let sourceElement = null;

document.getElementById('addService').addEventListener('click', () => {
    const service = createService(50, 50);
    graph.addCell(service);
    addConfigTab(service);
});

['restApi', 'grpc', 'messageBroker', 'graphql'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => {
        selectedLinkType = document.getElementById(id).textContent.trim();
        sourceElement = null;
    });
});

paper.on('element:pointerdown', (elementView) => {
    if (selectedLinkType) {
        if (!sourceElement) {
            sourceElement = elementView.model;
        } else {
            const targetElement = elementView.model;
            if (sourceElement !== targetElement) {
                const link = createCommunicationLink(sourceElement, targetElement, selectedLinkType);
                graph.addCell(link);
            }
            sourceElement = null;
            selectedLinkType = null;
        }
    }
});

paper.on('element:pointerdblclick', (elementView) => {
    openServiceDialog(elementView.model);
});

paper.on('blank:pointerdown', () => {
    sourceElement = null;
    selectedLinkType = null;
});

const html = document.documentElement;


function updatePaperBackground() {
    const isDarkMode = html.classList.contains('dark');
    paper.drawBackground({
        color: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.1)'
    });
}

function updateEditorTheme() {
    if (editor) {
        const isDarkMode = html.classList.contains('dark');
        monaco.editor.setTheme(isDarkMode ? 'vs-dark' : 'vs-light');
    }
}

updatePaperBackground();


// Export JSON
document.getElementById('exportJSON').addEventListener('click', () => {
    const json = graph.toJSON();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(json));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "microservice_workflow.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
});

// Zoom controls
const zoomIn = () => paper.scale(paper.scale().sx * 1.2, paper.scale().sy * 1.2);
const zoomOut = () => paper.scale(paper.scale().sx * 0.8, paper.scale().sy * 0.8);

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === '=') {
        e.preventDefault();
        zoomIn();
    } else if (e.ctrlKey && e.key === '-') {
        e.preventDefault();
        zoomOut();
    }
});

// Pan the paper by dragging the blank area
let isPanning = false;
let panStartPosition;

paper.on('blank:pointerdown', (event, x, y) => {
    isPanning = true;
    panStartPosition = { x, y };
});

paper.on('blank:pointermove', (event, x, y) => {
    if (isPanning) {
        const dx = x - panStartPosition.x;
        const dy = y - panStartPosition.y;
        paper.translate(dx, dy);
        panStartPosition = { x, y };
    }
});

paper.on('blank:pointerup', () => {
    isPanning = false;
});

// Highlight connected elements on hover
paper.on('element:mouseenter', (elementView) => {
    const connectedLinks = graph.getConnectedLinks(elementView.model);
    connectedLinks.forEach(link => {
        link.attr('line/stroke', '#ff0000');
        link.attr('line/strokeWidth', 3);
        const connectedElement = link.getSourceElement() === elementView.model ? link.getTargetElement() : link.getSourceElement();
        connectedElement.attr('body/stroke', '#ff0000');
        connectedElement.attr('body/strokeWidth', 3);
    });
});

paper.on('element:mouseleave', (elementView) => {
    const connectedLinks = graph.getConnectedLinks(elementView.model);
    connectedLinks.forEach(link => {
        link.attr('line/stroke', link.get('attrs').line.stroke);
        link.attr('line/strokeWidth', 2);
        const connectedElement = link.getSourceElement() === elementView.model ? link.getTargetElement() : link.getSourceElement();
        connectedElement.attr('body/stroke', '#6b46c1');
        connectedElement.attr('body/strokeWidth', 2);
    });
});

// Service Dialog
const serviceDialog = document.getElementById('serviceDialog');
const serviceName = document.getElementById('serviceName');
const serviceDescription = document.getElementById('serviceDescription');

function openServiceDialog(service) {
    currentService = service;
    serviceName.value = service.prop('config/name');
    serviceDescription.value = service.prop('config/description');
    serviceDialog.classList.remove('hidden');
}

document.getElementById('cancelServiceEdit').addEventListener('click', () => {
    serviceDialog.classList.add('hidden');
});

document.getElementById('saveServiceEdit').addEventListener('click', () => {
    if (currentService) {
        currentService.prop('config/name', serviceName.value);
        currentService.prop('config/description', serviceDescription.value);
        currentService.attr('label/text', serviceName.value);
        updateConfigTab(currentService);
        updateEditorContent(currentService);
    }
    serviceDialog.classList.add('hidden');
});

// Config Tabs
const configTabs = document.getElementById('configTabs');

function addConfigTab(service) {
    const tab = document.createElement('button');
    tab.textContent = service.prop('config/name');
    tab.classList.add('px-4', 'py-2', 'bg-muted', 'text-foreground', 'hover:bg-muted-foreground', 'transition-colors');
    tab.addEventListener('click', () => showConfig(service));
    configTabs.insertBefore(tab, document.getElementById('addConfigTab'));
}

function updateConfigTab(service) {
    const tabs = configTabs.getElementsByTagName('button');
    for (let tab of tabs) {
        if (tab.textContent === service.prop('config/name')) {
            tab.textContent = service.prop('config/name');
            break;
        }
    }
}

function showConfig(service) {
    currentService = service;
    updateEditorContent(service);
}

// Monaco Editor setup
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.30.1/min/vs' } });
require(['vs/editor/editor.main'], function () {
    editor = monaco.editor.create(document.getElementById('monacoEditor'), {
        value: '',
        language: 'yaml',
        theme: 'vs-dark',
        automaticLayout: true
    });

    editor.onDidChangeModelContent(() => {
        if (currentService) {
            currentService.prop('config/yaml', editor.getValue());
        }
    });

    // Set up YAML schema for code completion
    const yamlSchema = {
        uri: "http://myserver/microservice-schema.json",
        fileMatch: ['*'],
        schema: {
            type: "object",
            properties: {
                name: { type: "string" },
                port: { type: "integer" },
                version: { type: "string" },
                dependencies: {
                    type: "array",
                    items: { type: "string" }
                },
                environment: {
                    type: "object",
                    additionalProperties: { type: "string" }
                }
            }
        }
    };

    monaco.languages.yaml.yamlDefaults.setDiagnosticsOptions({
        validate: true,
        schemas: [yamlSchema]
    });

    updateEditorTheme();
});

function updateEditorContent(service) {
    if (editor) {
        editor.setValue(service.prop('config/yaml'));
    }
}

// Initialize the first service
const initialService = createService(50, 50);
graph.addCell(initialService);
addConfigTab(initialService);
showConfig(initialService);

