import { ConditionalSymbolState } from "./ConditionalSymbolState";
import { DirectiveToken, Token } from "./Token";
import { TokenStream } from "./TokenStream";
import { TokenType } from "./TokenType";

interface Condition {
    satisfied: boolean;
    wasSatisfied: boolean;
}

export class Preprocessor {
    private _input: TokenStream;
    private _symbolState: ConditionalSymbolState;
    private _conditions: Condition[];
    private _current: Token | null;

    constructor(input: string, symbolState: ConditionalSymbolState) {
        this._input = new TokenStream(input);
        this._symbolState = symbolState;
        this._conditions = [];
        this._current = null;
    }

    private handleIf(symbol: string) {
        const satisfied = this._symbolState.defined.includes(symbol);
        const wasSatisfied = satisfied;
        const activeSymbol = { satisfied, wasSatisfied };
        this._conditions.push(activeSymbol);

        if (!this._symbolState.checked.includes(symbol)) {
            this._symbolState.checked.push(symbol);
        }
    }

    private handleElif(symbol: string) {
        const conditional = this._conditions.slice(-1)[0];
        if (!conditional) {
            return;
        }
        if (conditional.wasSatisfied) {
            conditional.satisfied = false;
            return;
        }
        conditional.satisfied = this._symbolState.defined.includes(symbol);
        conditional.wasSatisfied = conditional.satisfied;
    }

    private handleElse() {
        const conditional = this._conditions.slice(-1)[0];
        if (!conditional) {
            return;
        }
        if (conditional.wasSatisfied) {
            conditional.satisfied = false;
            return;
        }
        conditional.satisfied = true;
        conditional.wasSatisfied = true;
    }

    private isConditionalSatisfied(): boolean {
        if (!this._conditions.length) {
            return true;
        }
        for (let i = 0; i < this._conditions.length; i++) {
            if (!this._conditions[i].satisfied) {
                return false;
            }
        }
        return true;
    }

    private processDirective(token: DirectiveToken) {
        switch (token.directive) {
            case "define":
                if (!this._symbolState.defined.includes(token.symbol)) {
                    this._symbolState.defined.push(token.symbol);
                }
                break;
            case "undefine":
                if (this._symbolState.defined.includes(token.symbol)) {
                    this._symbolState.defined = this._symbolState.defined.filter(s => s !== token.symbol);
                }
                break;
            case "if":
                this.handleIf(token.symbol);
                break;
            case "elif":
                this.handleElif(token.symbol);
                break;
            case "else":
                this.handleElse();
                break;
            case "endif":
                this._conditions.pop();
                break;
        }
    }

    private next(): Token | null {
        while (!this._input.eof) {
            let token = this._input.read()!;

            if (token.type === TokenType.directive) {
                this.processDirective(token as DirectiveToken);
                continue;
            }

            if (!this._conditions.length) {
                return token;
            }

            if (this.isConditionalSatisfied()) {
                return token;
            }
        }

        return null;
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

    get column(): number {
        return this._input.column;
    }

    get eof() {
        return this.peek() === null;
    }
}
