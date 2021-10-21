import { ConditionalSymbolState } from "./ConditionalSymbolState";
import { Preprocessor } from "./Preprocessor";
import { TokenType } from "./TokenType";

interface ALObject {
    type: string;
    id: number;
    name: string;
    _content: any[];
}

interface ParserFunction {
    (object: ALObject): boolean;
}
interface ParserDelegate {
    (): (string | ParserFunction)[];
}

export class Parser {
    private _input: Preprocessor;

    constructor(input: string, symbols: string[]) {
        this._input = new Preprocessor(input, {
            defined: symbols,
            checked: [],
        });
    }

    private skipToSymbol(symbol: string) {
        let token = this._input.peek();
        while (token) {
            if (token.type === TokenType.symbol && token.value === symbol) {
                return;
            }
            this._input.read();
            token = this._input.peek();
        }
    }

    private skipSymbol(symbol: string): boolean {
        let token = this._input.peek();
        if (token && token.type === TokenType.symbol && token.value === symbol) {
            this._input.read();
            return true
        }
        return false;
    }

    private skipKeyword(keyword: string): boolean {
        let token = this._input.peek();
        if (token && token.type === TokenType.word && (token.value === keyword || token.value.toLowerCase() === keyword.toLowerCase())) {
            this._input.read();
            return true;
        }
        return false;
    }

    private readIdentifier(): string | null {
        const token = this._input.peek();
        if (!token || token.type !== TokenType.word) {
            return null;
        }

        this._input.read();
        return token.value;
    }

    private getObjectTypeParser(): ParserDelegate | undefined {
        const token = this._input.peek();
        if (!token || token.type !== TokenType.word) {
            return;
        }
        return this.parsers[token.value] || this.parsers[token.value.toLowerCase()];
    }

    private parseObjectId(object: ALObject): boolean {
        const token = this._input.peek();
        if (!token || token.type !== TokenType.number) {
            return false;
        }

        object._content.push({
            type: "objectId",
            position: token.startsAt,
        });
        const id = parseInt(token.value);
        if (id) {
            this._input.read();
            object.id = id;
            return true;
        }
        return false;
    }

    private parseObjectName(object: ALObject): boolean {
        const token = this._input.peek();
        if (!token || token.type !== TokenType.word) {
            return false;
        }

        object._content.push({
            type: "objectId",
            position: token.startsAt,
        });
        this._input.read();
        object.name = token.value;
        return true;
    }

    private parseImplements(object: ALObject): boolean {
        if (!this.skipKeyword("implements")) {
            return true;
        }

        const impl = [];
        while (true) {
            let identifier = this.readIdentifier();
            if (!identifier) {
                return false;
            }
            impl.push(identifier);
            if (this.skipSymbol(",")) {
                continue;
            }
            break;
        }
        (object as any).implements = impl;
        return true;
    }

    private parseIgnoreBody(): boolean {
        if (!this.skipSymbol("{")) {
            return false;
        }
        this.skipToSymbol("}");
        if (!this.skipSymbol("}")) {
            return false;
        }
        return true;
    }

    private parsers: any = {
        codeunit: () => [
            this.parseObjectId,
            this.parseObjectName,
            this.parseImplements,
            this.parseIgnoreBody
        ],
        controladdin: () => {

        },
        dotnet: () => {

        },
        entitlement: () => {

        },
        enum: () => {

        },
        enumextension: () => {

        },
        interface: () => [
            this.parseObjectName,
            this.parseIgnoreBody
        ],
        page: () => {

        },
        pagecustomization: () => {

        },
        pageextension: () => {

        },
        permissionset: () => {

        },
        permissionsetextension: () => {

        },
        profile: () => {

        },
        query: () => {

        },
        report: () => {

        },
        reportextension: () => {

        },
        table: () => {

        },
        tableextension: () => {

        },
        xmlport: () => {

        },
    }

    private parseObject(state: ConditionalSymbolState): any {
        const parser = this.getObjectTypeParser();
        if (!parser) {
            return null;
        }

        const declaration = {
            type: "objectType",
            // TODO position must be read from token
            position: [this._input.line, this._input.column],
        };
        const object = {
            type: this._input.read()!.value,
            _content: [declaration],
        } as ALObject;

        const parts = parser();
        for (let part of parts) {
            switch (typeof part) {
                case "function":
                    if (!part.call(this, object)) {
                        if (object.type && object.id && object.name) {
                            return object;
                        }
                        return null
                    }
                    break;
            }
        }

        return object;
    }

    private skipToNextLine() {
        let line = this._input.line;
        while (this._input.line === line) {
            if (this._input.eof) {
                break;
            }
            this._input.read();
        }
    }

    private getObjects(symbols: string[]): any {
        let root: any = {
            type: "root",
            contents: [],
            symbols: {
                checked: [],
                defined: symbols,
            },
        };

        while (!this._input.eof) {
            const object = this.parseObject(root);
            if (object) {
                root.contents.push(object);
                continue;
            } else {
                this.skipToNextLine();
                continue;
            }
            this._input.read();
        }
        debugger;
        return root;
    }

    parseObjects(symbols: string[]): ALObject[] {
        return this.getObjects(symbols);
    }
}
