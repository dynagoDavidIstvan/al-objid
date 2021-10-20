import { TokenType } from "./TokenType";

export interface Token {
    type: TokenType;
    value: string;
    startsAt: {
        line: number,
        column: number,
    };
}

export interface DirectiveToken extends Token {
    directive: string;
    symbol: string;
}
