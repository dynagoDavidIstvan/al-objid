import { CharacterStream } from "./CharacterStream";
import { Predicate } from "./Predicate";
import { Token } from "./Token";
import { TokenType } from "./TokenType";

const UNTIL_END_OF_LINE = Symbol("UNTIL_END_OF_LINE");
const READ_ONE = Symbol("READ_ONE");
const UNTIL_WORD_BREAK = Symbol("UNTIL_WORD_BREAK");

export class TokenStream {
    private _input: CharacterStream;
    private _current: Token | null;

    constructor(input: string) {
        this._input = new CharacterStream(input);
        this._current = null;
    }

    private createToken(type: TokenType, predicate: Predicate<string>): Token {
        const startsAt = {
            line: this._input.line,
            column: this._input.column
        };
        const value = this.readWhile(predicate);
        return { type, value, startsAt };
    }

    private isWhitespace(char: string): boolean {
        return " \n\r\t".indexOf(char) >= 0;
    }

    private isComment(char: string): boolean {
        return char === "/" && "/*".indexOf(this._input.peek(1)) >= 0;
    }

    private isNumber(char: string): boolean {
        return "0123456789".indexOf(char) >= 0;
    }

    private isQuotedIdentifier(char: string): boolean {
        return char === "\"";
    }

    private isPragma(char: string): boolean {
        return char === "#";
    }

    private isSymbol(char: string): boolean {
        return "{}[]():;.,=+-*/".indexOf(char) >= 0;
    }

    private isString(char: string): boolean {
        return char === "'";
    }

    private skipToEndOfLine() {
        const line = this._input.line;
        while (!this._input.eof && this._input.line === line) {
            this._input.read();
        }
    }

    private skipWhitespace() {
        this._input.read();
        while (" \n\r\t".indexOf(this._input.peek()) >= 0) {
            this._input.read();
        }
    }

    private skipComment() {
        this._input.read(); // Skip the / character (open comment)
        if (this._input.read() === "*") {
            return this.skipCommentBlock();
        }
        this.skipToEndOfLine();
    }

    private skipCommentBlock() {
        while (!this._input.eof) {
            if (this._input.read() === "*" && this._input.peek() === "/") {
                this._input.read();
                return;
            }
        }
    }

    private readWhile(predicate: Predicate<string>): string {
        let result = this._input.read();
        while (!this._input.eof) {
            let next = this._input.peek();
            const predicateResult = predicate(next);
            switch (predicateResult) {
                case false:
                    break;
                case true:
                    result += this._input.read();
                    continue;
                case UNTIL_END_OF_LINE:
                    while (!this._input.eof && !this._input.eol) {
                        result += this._input.read();
                    }
                    break;
                case READ_ONE:
                    break;
                case UNTIL_WORD_BREAK:
                    next = this._input.peek();
                    while (!this._input.eof && !this._input.eol && !this.isWhitespace(next) && !this.isSymbol(next)) {
                        result += this._input.read();
                        next = this._input.peek();
                    }
                    break;
            }
            break;
        }
        return result;
    }

    private readNumber(): Token {
        return this.createToken(TokenType.number, () => UNTIL_WORD_BREAK);
    }

    private readQuotedIdentifier(): Token {
        let escape = false;
        let finish = false;
        return this.createToken(TokenType.word, (char) => {
            if (finish) {
                return false;
            }
            if (char === '"') {
                if (escape) {
                    escape = false;
                    return true;
                }
                if (this._input.peek(1) === '"') {
                    escape = true;
                    return true;
                }
                finish = true;
                return true;
            }
            return true;
        });
    }

    private readString(): Token {
        let escape = false;
        let finish = false;
        return this.createToken(TokenType.string, (char) => {
            if (finish) {
                return false;
            }
            if (char === "'") {
                if (escape) {
                    escape = false;
                    return true;
                }
                if (this._input.peek(1) === "'") {
                    escape = true;
                    return true;
                }
                finish = true;
                return true;
            }
            return true;
        });
    }

    private readPragma(): Token {
        return this.createToken(TokenType.pragma, () => UNTIL_END_OF_LINE);
    }

    private readSymbol(): Token {
        return this.createToken(TokenType.symbol, () => READ_ONE);
    }

    private readWord(): Token {
        return this.createToken(TokenType.word, () => UNTIL_WORD_BREAK);
    }

    private next(): Token | null {
        let char = this._input.peek();

        if (this.isWhitespace(char)) {
            this.skipWhitespace();
        }

        if (this._input.eof) {
            return null;
        }

        char = this._input.peek();

        if (this.isComment(char)) {
            this.skipComment();
            return this.next();
        }

        if (this.isPragma(char)) {
            return this.readPragma();
        }

        if (this.isNumber(char)) {
            return this.readNumber();
        }

        if (this.isQuotedIdentifier(char)) {
            return this.readQuotedIdentifier();
        }

        if (this.isString(char)) {
            return this.readString();
        }

        if (this.isSymbol(char)) {
            return this.readSymbol();
        }

        return this.readWord();
    }

    read(): Token | null {
        if (this._current) {
            const token = this._current;
            this._current = null;
            return token;
        }
        return this.next();
    }

    peek(): Token | null {
        return this._current || (this._current = this.next());
    }

    get line(): number {
        return this._input.line;
    }

    get eof() {
        return this.peek() === null;
    }
}
