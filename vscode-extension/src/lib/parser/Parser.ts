import { OBJECT_TYPES } from "../constants";
import { ConditionalSymbolState } from "./ConditionalSymbolState";
import { DirectiveToken, Token } from "./Token";
import { TokenStream } from "./TokenStream";
import { TokenType } from "./TokenType";

interface ALObject {
    type: string;
    id: string;
}

const ERROR = Symbol("ERROR");

const OBJECT_TYPE_LIST = `|${OBJECT_TYPES.join("|")}|`;

export class Parser {
    private _lexer: TokenStream;

    constructor(input: string, symbols: string[]) {
        this._lexer = new TokenStream(input, { 
            defined: symbols,
            checked: [],
         });
    }

    private createObject(type: string) {
        return {
            type,
            id: 0,
        };
    }

    private isDirective(): boolean {
        const token = this._lexer.peek<DirectiveToken>();
        return token !== null && token.type == TokenType.directive;
    }

    private isDefineDirective(token: DirectiveToken | null): boolean {
        return token !== null && token.type == TokenType.directive && token.directive === "define";
    }

    private isObjectTypeDeclaration(): boolean {
        const token = this._lexer.peek();
        return token !== null && token.type === TokenType.word && (this.isObjectType(token.value) || this.isObjectType(token.value.toLowerCase()));
    }

    private isObjectType(word: string) {
        return OBJECT_TYPE_LIST.indexOf("|" + word + "|") >= 0;
    }

    private isIdentifier(): boolean {
        const token = this._lexer.peek();
        return token !== null && token.type == TokenType.word;
    }

    private maybeObjectId(): number | null {
        const token = this._lexer.read();
        if (token !== null && token.type === TokenType.number) {
            const id = parseInt(token.value);
            if (id) {
                return id;
            }
        }
        return null;
    }

    private parseObjectDeclaration(): any {
        let token = this._lexer.read()!;
        const result: any = {
            type: "object",
            subtype: token.value,
            contents: [],
        };
        return result;
    }

    private parseObjectType(state: ConditionalSymbolState): string | null {
        return this.isObjectTypeDeclaration() ? this._lexer.read()!.value : null;
    }

    private parseObjectId(state: ConditionalSymbolState): number | null {
        return this.maybeObjectId();
    }

    private parseIdentifier(state: ConditionalSymbolState): string | null {
        return this.isIdentifier() ? this._lexer.read()!.value : null;
    }

    private parseObject(state: ConditionalSymbolState): any {
        const objectType = this.parseObjectType(state);
        if (!objectType) {
            return null;
        }

        const id = this.parseObjectId(state);
        if (!id) {
            // TODO check non-ID-kinds of objects (interface, controladdin, etc.)
            return null;
        }

        const name = this.parseIdentifier(state);
        if (!name) {
            return null;
        }

        return {
            type: "object",
            definition: {
                objectType,
                id
            }
        };
    }

    private skipToNextLine() {
        let line = this._lexer.line;
        while (this._lexer.line === line) {
            if (this._lexer.eof) {
                break;
            }
            this._lexer.read();
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
        while (!this._lexer.eof) {
            const object = this.parseObject(root);
            if (object) {
                root.contents.push(object);
                continue;
            } else {
                this.skipToNextLine();
                continue;
            }
            this._lexer.read();
        }
        debugger;
        return root;
    }

    parseObjects(symbols: string[]): ALObject[] {
        return this.getObjects(symbols);
    }
}
