import { ActiveConditionalSymbol } from "./ActiveConditionalSymbol";
import { CharacterStream } from "./CharacterStream";
import { ConditionalBlock, ConditionalSymbolState } from "./ConditionalSymbolState";
import { Predicate } from "./Predicate";
import { Token } from "./Token";
import { TokenType } from "./TokenType";

const UNTIL_END_OF_LINE = Symbol("UNTIL_END_OF_LINE");
const READ_ONE = Symbol("READ_ONE");
const UNTIL_WORD_BREAK = Symbol("UNTIL_WORD_BREAK");

export class TokenStream {
    private _input: CharacterStream;
    private _current: Token | null;
    private _symbolState: ConditionalSymbolState;
    private _activeSymbols: ActiveConditionalSymbol[];

    constructor(input: string, symbolState: ConditionalSymbolState) {
        this._input = new CharacterStream(input);
        this._current = null;
        this._symbolState = symbolState;
        this._activeSymbols = [];
    }

    private createTokenFromPredicate(type: TokenType, predicate: Predicate<string>): Token {
        const startsAt = {
            line: this._input.line,
            column: this._input.column
        };
        const value = this.readWhile(predicate);
        return { type, value, startsAt };
    }

    private createTokenFromString(type: TokenType, value: string): Token {
        const startsAt = {
            line: this._input.line,
            column: this._input.column
        };
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

    private isDirective(char: string): boolean {
        return char === "#";
    }

    private isBoundarySymbol(char: string): boolean {
        return `{}[]();.,=:+-*/<>#"'`.indexOf(char) >= 0;
    }

    private isSymbol(char: string): boolean {
        return "{}[]();.,=".indexOf(char) >= 0;
    }

    private isMultiSymbol(char: string): boolean {
        return ":+-*/<>".indexOf(char) >= 0;
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
                    while (!this._input.eof && !this._input.eol && !this.isWhitespace(next) && !this.isBoundarySymbol(next)) {
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
        let hasDot = false;
        return this.createTokenFromPredicate(TokenType.number, char => {
            if (char === ".") {
                if (hasDot) {
                    return false;
                }
                hasDot = true;
                return true;
            }
            return this.isNumber(char);
        });
    }

    private readQuotedIdentifier(): Token {
        let escape = false;
        let finish = false;
        return this.createTokenFromPredicate(TokenType.word, (char) => {
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
        return this.createTokenFromPredicate(TokenType.string, (char) => {
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

    private activateConditional(symbol: string, block: ConditionalBlock) {
        const activeSymbol = {symbol, block} as ActiveConditionalSymbol;
        this._activeSymbols.push(activeSymbol);
        activeSymbol.satisfied = this.isLastConditionalSatisfied();
    }

    private readDirective() {
        const value = this.readWhile(() => UNTIL_END_OF_LINE);
        const parts = value.split(" ");
        const directive = parts[0].substring(1).toLowerCase();
        const symbol = value.substring(directive.length + 2);

        switch (directive) {
            case "define":
                if (!this._symbolState.defined.includes(symbol)) {
                    this._symbolState.defined.push(symbol);
                }
                break;
            case "undefine":
                if (this._symbolState.defined.includes(symbol)) {
                    this._symbolState.defined = this._symbolState.defined.filter(s => s !== symbol);
                }
                break;
            case "if":
                this.activateConditional(symbol, ConditionalBlock.if);
                break;
            case "elif":
                this._activeSymbols.pop();
                this.activateConditional(symbol, ConditionalBlock.if);
                break;
            case "else":
                const last = this._activeSymbols.slice(-1);
                if (last && last[0]) {
                    last[0].block = ConditionalBlock.else;
                    last[0].satisfied = this.isLastConditionalSatisfied();
                }
                break;
            case "endif":
                this._activeSymbols.pop();
                break;
        }
    }

    private readMultiSymbol() {
        const first = this._input.read();
        const next = this._input.peek();
        const token = this.createTokenFromString(TokenType.symbol, first);
        if ((first === ":" && next == ":") || (next === "=")) {
            token.value += this._input.read();
        }
        return token;
    }

    private readSymbol(): Token {
        return this.createTokenFromPredicate(TokenType.symbol, () => READ_ONE);
    }

    private readWord(): Token {
        return this.createTokenFromPredicate(TokenType.word, () => UNTIL_WORD_BREAK);
    }

    private innerNext(): Token | null {
        if (this._input.eof) {
            return null;
        }

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
            return this.innerNext();
        }

        if (this.isDirective(char)) {
            this.readDirective();
            return this.innerNext();
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

        if (this.isMultiSymbol(char)) {
            return this.readMultiSymbol();
        }

        if (this.isSymbol(char)) {
            return this.readSymbol();
        }

        return this.readWord();
    }

    private isLastConditionalSatisfied(): boolean {
        if (!this._activeSymbols.length) {
            return true;
        }
        const { symbol, block } = this._activeSymbols.slice(-1)[0];
        const defined = this._symbolState.defined.includes(symbol);
        return block == ConditionalBlock.if ? defined : !defined;
    }

    private isConditionalSatisfied(): boolean {
        if (!this._activeSymbols.length) {
            return true;
        }
        for (let i = 0; i < this._activeSymbols.length; i++) {
            if (!this._activeSymbols[i].satisfied) {
                return false;
            }
        }
        return true;
    }

    private next(): Token | null {
        let token = this.innerNext();
        if (!this._activeSymbols.length) {
            return token;
        }

        while (token && !this.isConditionalSatisfied()) {
            token = this.innerNext();
        }

        return token;
    }

    read<T extends Token = Token>(): T | null {
        if (this._current) {
            const token = this._current;
            this._current = null;
            return token as T;
        }
        return this.next() as T;
    }

    peek<T extends Token = Token>(): T | null {
        return (this._current || (this._current = this.next())) as T;
    }

    get line(): number {
        return this._input.line;
    }

    get eof() {
        return this.peek() === null;
    }
}
