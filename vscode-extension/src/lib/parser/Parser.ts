import { OBJECT_TYPES } from "../constants";
import { Token } from "./Token";
import { TokenStream } from "./TokenStream";
import { TokenType } from "./TokenType";

interface ALObject {
    type: string;
    id: string;
}

const ERROR = Symbol("ERROR");

const OBJECT_TYPE_LIST = `|${OBJECT_TYPES.join("|")}|`;

export class Parser {
    private _tokens: TokenStream;

    constructor(input: string) {
        this._tokens = new TokenStream(input);
    }

    private createObject(type: string) {
        return {
            type,
            id: 0,
        };
    }

    private isObjectDeclaration(token: Token): boolean {
        if (token.type === TokenType.word && (this.isObjectType(token.value) || this.isObjectType(token.value.toLowerCase()))) {
            token.type = TokenType.objectDeclarationType;
            return true;
        }
        return false;
    }

    private isObjectType(word: string) {
        return OBJECT_TYPE_LIST.indexOf("|" + word + "|") > 0;
    }

    private *parseObjectDeclaration(): Generator<ALObject | symbol> {
        let token = this._tokens.read();
        if (!token || !this.isObjectType(token.value)) {
            yield ERROR;
            return;
        }
        let objectType = token.value;

        token = this._tokens.read();
        if (!token) {
            yield ERROR;
            return;
        }

        switch (token.type) {
            case TokenType.pragma:
                break;
            case TokenType.number:
                break;

            default:
                yield ERROR;
                return;
        }
    }

    private *getObjects(): Generator<ALObject> {
        while (!this._tokens.eof) {
            let token = this._tokens.read()!;

            let objectType: string | undefined;
            switch (token.type) {
                case TokenType.objectDeclarationType:
                    break;
                case TokenType.pragma:
                    break;
                default:
                    return;
            }
        }
    }

    parseObjects(): ALObject[] {
        return [...this.getObjects()];
    }
}
