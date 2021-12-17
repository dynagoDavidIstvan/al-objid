import { ALObject } from "@vjeko.com/al-parser-types-ninja";
import { clearInterval, setTimeout } from "timers";
import { Disposable, FileSystemWatcher, Uri, workspace, WorkspaceFolder, WorkspaceFoldersChangeEvent } from "vscode";
import { ALWorkspace } from "../lib/ALWorkspace";
import { getManifest } from "../lib/AppManifest";
import { ParserConnector } from "./ParserConnector";

const UPDATE_GRACE_INTERVAL = 100;

type OnDidChangeFoldersListener = (folders: WorkspaceFolder[]) => {};

type UpdateEntry = { folderUri: Uri, fileUri: Uri };

enum UpdateType {
    create,
    change,
    delete,
}

export class WorkspaceWatcher implements Disposable {
    //#region Singleton

    private static _instance: WorkspaceWatcher | undefined;

    private constructor() {
        this.setUpFolders();
        this.setUpWatchers();
        this._workspaceFoldersChangeEvent = workspace.onDidChangeWorkspaceFolders(this.onDidChangeWorkspaceFolders.bind(this) as any);
    }

    public static get instance() {
        return this._instance || (this._instance = new WorkspaceWatcher());
    }

    //#endregion

    private _watchers: { [key: string]: FileSystemWatcher } = {};
    private _disposed: boolean = false;
    private _workspaceFoldersChangeEvent: Disposable;
    private _listenersOnDidChangeFolders: OnDidChangeFoldersListener[] = [];
    private _alFolders: WorkspaceFolder[] = [];
    private _updateInterval: NodeJS.Timeout | undefined;
    private _updateCreated: UpdateEntry[] = [];
    private _updateChanged: UpdateEntry[] = [];
    private _updateDeleted: UpdateEntry[] = [];
    private _objectsPerUri: { [key: string]: ALObject[] } = {};
    // private _objectsPerFolder: { [key: string]: }

    private async setUpFolders() {
        this._alFolders = ALWorkspace.getALFolders() || [];
        for (let folder of this._alFolders) {
            const files = await workspace.findFiles("**/*.al");
            const objects = await ParserConnector.instance.parse(files);
            for (let object of objects) {
                if (!this._objectsPerUri[object.path]) {
                    this._objectsPerUri[object.path] = [];
                }
                this._objectsPerUri[object.path].push(object);
            }
        }
    }

    private rebuildObjectIndex() {

    }

    private onDidChangeWorkspaceFolders(added: WorkspaceFolder[], removed: WorkspaceFolder[]) {
        for (let folder of added) {
            this.addWatcher(folder.uri);
        }
        for (let folder of removed) {
            this.removeWatcher(folder.uri);
        }
        this.raiseOnDidChangeFolders();
    }

    private setUpWatchers() {
        if (!this._alFolders.length) {
            return;
        }
        for (let folder of this._alFolders) {
            this.addWatcher(folder.uri);
        }
    }

    private addWatcher(folderUri: Uri) {
        const watcher = workspace.createFileSystemWatcher(`${folderUri.fsPath}/**/*`);
        watcher.onDidCreate(fileUri => this.prepareUpdate(folderUri, fileUri, UpdateType.create));
        watcher.onDidChange(fileUri => this.prepareUpdate(folderUri, fileUri, UpdateType.change));
        watcher.onDidDelete(fileUri => this.prepareUpdate(folderUri, fileUri, UpdateType.delete));
        this._watchers[folderUri.fsPath] = watcher;
    }

    private removeWatcher(uri: Uri) {
        if (!this._watchers[uri.fsPath]) {
            return;
        }
        delete this._watchers[uri.fsPath];
    }

    private prepareUpdate(folderUri: Uri, fileUri: Uri, updateType: UpdateType) {
        if (this._updateInterval) {
            clearInterval(this._updateInterval);
            this._updateInterval = undefined;
        }

        const updateEntry: UpdateEntry = { folderUri, fileUri };
        switch (updateType) {
            case UpdateType.create:
                this._updateCreated.push(updateEntry);
                break;
            case UpdateType.change:
                this._updateChanged.push(updateEntry);
                break;
            case UpdateType.delete:
                this._updateDeleted.push(updateEntry);
                break;
        }

        this._updateInterval = setTimeout(async () => {
            await this.processUpdates();
            this._updateInterval = undefined;
        }, UPDATE_GRACE_INTERVAL);
    }

    private async processUpdates() {
        this._updateCreated = [];
        this._updateChanged = [];
        this._updateDeleted = [];
    }

    private disposeWatchers() {
        const disposables = Object.keys(this._watchers).map(key => this._watchers[key]);
        this._watchers = {};
        for (let disposable of disposables) {
            disposable.dispose();
        }
    }

    public dispose() {
        if (this._disposed) {
            return;
        }

        this._disposed = true;
        this.disposeWatchers();
        this._workspaceFoldersChangeEvent.dispose();
    }

    private raiseOnDidChangeFolders() {
        for (let listener of this._listenersOnDidChangeFolders) {
            listener(this._alFolders);
        }
    }

    public subscribeOnDidChangeFolders(listener: OnDidChangeFoldersListener) {
        if (!this._listenersOnDidChangeFolders.includes(listener)) {
            this._listenersOnDidChangeFolders.push(listener);
        }
    }

    public unsubscribeOnDidChangeFolders(listener: OnDidChangeFoldersListener) {
        if (!this._listenersOnDidChangeFolders.includes(listener)) {
            return;
        }
        this._listenersOnDidChangeFolders = this._listenersOnDidChangeFolders.filter(l => l !== listener);
    }
}
