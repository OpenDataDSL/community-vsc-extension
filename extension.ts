'use strict';

import * as fs from 'fs'
import * as net from 'net';
import * as vscode from 'vscode';
import {LanguageClient, LanguageClientOptions, ServerOptions, StreamInfo} from "vscode-languageclient";
import { env } from 'process';
const isPortReachable = require('is-port-reachable');
var shell = require('shelljs');
let odsldir = env.APPDATA + "/ODSL/";

/** Called when extension is activated */
export async function activate(context: vscode.ExtensionContext) {
    var channel = vscode.window.createOutputChannel("ODSL");
    channel.appendLine('Activating ODSL: ' + context.extensionPath);
    let config = vscode.workspace.getConfiguration('odsl.c')
    let port: number = config.get("port");
    let environment: string = "prod";

    try {
        var cf = fs.existsSync(odsldir + ".odslenv");
        if (cf) {
            var document = await vscode.workspace.openTextDocument(odsldir + ".odslenv");
            let text = document.getText();
            let lines = text.split("\n");
            for (let i in lines) {
                if (!lines[i].startsWith("#")) {
                    if (lines[i].startsWith("dev")) {
                        environment = "dev";
                    } else if (lines[i].startsWith("temp")) {
                        environment = "temp";
                    } else if (lines[i].startsWith("test")) {
                        environment = "test";
                    } else if (lines[i].startsWith("local")) {
                        environment = "local";
                    }
                }
            }
        }
    } catch (e) { 
        channel.appendLine(e);
    }
    if (environment !== "prod")
        channel.appendLine("Connecting to environment: " + environment);

    channel.appendLine("Checking port");
    (async () => {
        var is_ready = false;
        is_ready = await isPortReachable(port);
        if (!is_ready) {
            channel.appendLine("Running OpenDataDSL process");
            shell.cd(context.extensionPath + "/dist");
            var validate = "./validate.bat";
            var script = "./debug_adapter_windows.bat";

            shell.exec(validate, function(code: any, stdout: any, stderr: any) {
                channel.appendLine("code: " + code);
                channel.appendLine("stdout: " + stdout);
                channel.appendLine("stderr: " + stderr);
                if (code != 0) {
                    channel.appendLine("*************************************************************");
                    channel.appendLine("There is an issue running java: Verify that java is installed");
                    channel.appendLine("*************************************************************");
                } else {
                    shell.exec(script, function() {});    
                    createConnection();                        
                }
            });
        } else {
            channel.appendLine("Server is ready and listening on port: " + port);
            createConnection();
        }


    })();

    function createConnection() {
        channel.appendLine("Configuring ODSL Language Server");
        // Enable the language server
        let connectionInfo = {
            port: port,
            localPort: port + 1
        };

        // Pause for 5 seconds to allow the server to start
        let socket = new net.Socket();
        socket.on('error', function(e:any) {
            channel.appendLine(e.message)
            if (e.code == "ECONNREFUSED") {
                setTimeout(() => {
                    socket.connect(connectionInfo);
                }, 1000);
            }
        });
        socket.on('connect', function() {
            channel.appendLine("connected");
            socketConnected(socket);
        })
        setTimeout(() => {
            socket.connect(connectionInfo);
        }, 1000);
    }

    function socketConnected(socket: net.Socket) {
        // Options to control the language client
        let clientOptions: LanguageClientOptions = {
            // Register the server for java documents
            documentSelector: [{scheme: 'file', language: 'odsl'}],
            synchronize: {
                // Synchronize the setting section 'java' to the server
                // NOTE: this currently doesn't do anything
                configurationSection: 'odsl',
                // Notify the server about file changes to 'odsl' files contain in the workspace
                fileEvents: [
                    vscode.workspace.createFileSystemWatcher('**/*.odsl')
                ]
            },            
            outputChannel: channel,
            revealOutputChannelOn: 1,
            initializationOptions: {
                env: environment,
                mongodb: config.get("mongodb")
            }
        }

        let serverOptions : ServerOptions = () => {
            // Connect to language server via socket
            // let socket = net.connect(connectionInfo);
            let result: StreamInfo = {
                writer: socket,
                reader: socket
            };
            return Promise.resolve(result);
        };

        // Create the language client and start the client.
        channel.appendLine("Connecting to the ODSL Language Server");
        let client = new LanguageClient('odsl', 'ODSL Language Server', serverOptions, clientOptions);
        let disposable = client.start();

        // Push the disposable to the context's subscriptions so that the 
        // client can be deactivated on extension deactivation
        context.subscriptions.push(disposable);


        // Register commands
        vscode.commands.registerCommand('odsl.debugEditorContents', (resource: vscode.Uri) => {
            let config = vscode.workspace.getConfiguration('odsl.c')
            var args = [
                "--env=" + environment,
                "--process=DEBUG",
                "--mongodb=" + config.get("mongodb")
            ];
            channel.appendLine("Connecting to debug server on port:" + port);
            channel.appendLine("Debugging file:" + resource.fsPath);
            var debug = {
                type: 'odsl',
                name: 'Debug Editor Contents',
                request: 'launch',
                stopOnEntry: true,
                program: resource.fsPath,
                debugServer: port,
                args : args
            };
            try {
                vscode.debug.startDebugging(undefined, debug);
            } catch (e) {
                channel.appendLine("Error: " + e);
            }
        })

        vscode.commands.registerCommand('odsl.debugODSLRegion', (resource: vscode.Uri) => {
            let config = vscode.workspace.getConfiguration('odsl.c')
            var args = [
                "--env=" + environment,
                "--process=DEBUG",
                "--mongodb=" + config.get("mongodb")
            ];
            channel.appendLine("Connecting to debug server on port:" + port);
            channel.appendLine("Debugging file:" + resource.fsPath);
            var editor = vscode.window.activeTextEditor;
            var debug = {
                type: 'odsl',
                name: 'Debug ODSL Region',
                request: 'launch',
                stopOnEntry: true,
                program: resource.fsPath,
                debugServer: port,
                foldingRangeLine: editor.selection.start.line + 1,
                args : args
            };
            try {
                vscode.debug.startDebugging(undefined, debug);
            } catch (e) {
                channel.appendLine("Error: " + e);
            }
        })

        vscode.commands.registerCommand('odsl.runSelectedText', () => {
            let config = vscode.workspace.getConfiguration('odsl.c')
            var args = [
                "--env=" + environment,
                "--process=DEBUG",
                "--mongodb=" + config.get("mongodb")
            ];
            channel.appendLine("Connecting to debug server on port:" + port);
            channel.appendLine("Running selected text");
            var editor = vscode.window.activeTextEditor;
            var text = editor.document.getText(editor.selection);
            var debug = {
                type: 'odsl',
                name: 'Debug selected text',
                request: 'launch',
                stopOnEntry: false,
                script: text,
                debugServer: port,
                noDebug: true,
                args : args
            };
            try {
                vscode.debug.startDebugging(undefined, debug);
            } catch (e) {
                channel.appendLine("Error: " + e);
            }
        })

    }
    
} 
