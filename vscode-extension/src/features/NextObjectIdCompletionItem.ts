import {
    Command,
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    Position,
    Range,
    TextEdit,
    Uri,
    workspace,
    WorkspaceEdit,
} from "vscode";
import { Backend } from "../lib/Backend";
import { AppManifest, NinjaALRange } from "../lib/types";
import { LogLevel, output } from "./Output";
import { NextObjectIdInfo } from "../lib/BackendTypes";
import { Telemetry } from "../lib/Telemetry";
import { NextIdContext } from "./ParserConnector";
import { showDocument } from "../lib/functions";
import { UI } from "../lib/UI";
import { DOCUMENTS, LABELS } from "../lib/constants";
import { syncIfChosen } from "./NextObjectIdCompletionProvider";

export type CommitNextObjectId = (manifest: AppManifest) => Promise<NextObjectIdInfo>;

export class NextObjectIdCompletionItem extends CompletionItem {
    private _injectSemicolon: boolean = false;
    private _range: NinjaALRange | undefined;

    private isIdEqual(left: number | number[], right: number) {
        let leftAsArray = left as number[];

        switch (true) {
            case typeof left === "number":
                return left === right;

            case Array.isArray(left):
                return leftAsArray.length === 1 && leftAsArray[0] === right;
        }

        return false;
    }

    constructor(
        type: string,
        objectId: NextObjectIdInfo,
        manifest: AppManifest,
        position: Position,
        uri: Uri,
        nextIdContext: NextIdContext,
        range?: NinjaALRange
    ) {
        super(
            `${objectId.id}${nextIdContext.injectSemicolon ? ";" : ""}`,
            CompletionItemKind.Constant
        );

        this._injectSemicolon = nextIdContext.injectSemicolon;
        this._range = range;

        this.sortText = nextIdContext.additional
            ? `0.${nextIdContext.additional.ordinal / 1000}`
            : "0";
        this.command = this.getCompletionCommand(position, uri, type, manifest, objectId);
        this.documentation = this.getCompletionDocumentation(type, objectId);
        this.insertText = `${objectId.id}${this._injectSemicolon ? ";" : ""}`;
        this.detail = "AL Object ID Ninja";
        this.label =
            range && range.description ? `${objectId.id} (${range.description})` : this.insertText;
        this.kind = CompletionItemKind.Constant;
    }

    getCompletionCommand(
        position: Position,
        uri: Uri,
        type: string,
        manifest: AppManifest,
        objectId: NextObjectIdInfo
    ): Command {
        return {
            command: "vjeko-al-objid.commit-suggestion",
            title: "",
            arguments: [
                async () => {
                    output.log(
                        `Committing object ID auto-complete for ${type} ${objectId.id}`,
                        LogLevel.Info
                    );
                    const { authKey } = manifest.ninja.config;
                    const realId = await Backend.getNextNo(
                        manifest.id,
                        type,
                        manifest.idRanges,
                        true,
                        authKey,
                        objectId.id as number
                    );
                    const notChanged = !realId || this.isIdEqual(realId.id, objectId.id as number);
                    Telemetry.instance.log(
                        "getNextNo-commit",
                        manifest.id,
                        notChanged ? undefined : "different"
                    );
                    if (notChanged) {
                        return;
                    }
                    output.log(
                        `Another user has consumed ${type} ${objectId.id} in the meantime. Retrieved new: ${type} ${realId.id}`,
                        LogLevel.Info
                    );

                    let replacement = `${realId.id}`;
                    if (!realId.available) {
                        if (this._range) {
                            UI.nextId
                                .showNoMoreInLogicalRangeWarning(this._range.description)
                                .then(result => {
                                    if (result === LABELS.BUTTON_LEARN_MORE) {
                                        showDocument(DOCUMENTS.LOGICAL_RANGES);
                                    }
                                });
                        } else {
                            syncIfChosen(manifest, UI.nextId.showNoMoreNumbersWarning());
                        }
                        replacement = "";
                    }

                    let replace = new WorkspaceEdit();
                    replace.set(uri, [
                        TextEdit.replace(
                            new Range(
                                position,
                                position.translate(0, objectId.id.toString().length)
                            ),
                            replacement
                        ),
                    ]);
                    workspace.applyEdit(replace);
                },
            ],
        };
    }

    private nextIdDescription(type: string): string {
        const parts = type.split("_");

        if (parts.length === 1) {
            return type;
        }

        let id = "";
        switch (parts[0]) {
            case "table":
                id = "field ID";
                break;
            case "enum":
                id = "value ID";
                break;
        }

        return `${id} from ${parts[0]} ${parts[1]}`;
    }

    getCompletionDocumentation(type: string, objectId: NextObjectIdInfo): MarkdownString {
        const firstLine = `Assigns the next available ${this.nextIdDescription(
            type
        )} from the Azure back end.`;
        let typeDesc = `${type} ${objectId.id}`;
        if (type.startsWith("table_")) {
            typeDesc = `field(${objectId.id}; ...)`;
        } else if (type.startsWith("enum_")) {
            typeDesc = `value(${objectId.id}; ...)`;
        }

        const message = new MarkdownString(firstLine);
        message.appendCodeblock(typeDesc, "al");
        if (!objectId.hasConsumption) {
            message.appendMarkdown(
                "**Important:** The back end has no object ID consumption information. Please, run `Ninja: Synchronize object IDs with the Azure back end` command before accepting this object ID."
            );
            return message;
        }
        message.appendMarkdown(
            "This number is **temporary**. The actual number will be assigned when you select this auto-complete entry."
        );

        return message;
    }
}
