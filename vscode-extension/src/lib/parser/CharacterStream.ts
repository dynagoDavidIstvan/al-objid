import { EOL } from "os";

const EOL_LENGTH = EOL.length;

export class CharacterStream {
    private _input: string;
    private _length: number;
    private _position: number;
    private _line: number;
    private _column: number;

    constructor(input: string) {
        this._input = input;
        this._length = input.length;
        this._position = 0;
        this._line = 0;
        this._column = 1;
    }

    read(): string {
        let char = this._input[this._position++];
        if (char === "\n") {
            this._line++;
            this._column = 0;
        } else {
            this._column++;
        }
        return char;
    }

    peek(relativePos: number = 0): string {
        return this._input[this._position + relativePos];
    }

    get eof(): boolean {
        return this._position >= this._length;
    }

    get eol(): boolean {
        if (EOL_LENGTH === 1) {
            return this._input[this._position] === EOL;
        }
        for (let i = 0; i < EOL_LENGTH; i++) {
            if (this._input[this._position + i] !== EOL[i]) {
                return false;
            }
        }
        return true;
    }

    get line(): number {
        return this._line;
    }

    get column(): number {
        return this._column;
    }
}
