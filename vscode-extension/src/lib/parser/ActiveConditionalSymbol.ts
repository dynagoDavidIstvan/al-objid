import { ConditionalBlock } from "./ConditionalSymbolState";

export interface ActiveConditionalSymbol {
    symbol: string;
    block: ConditionalBlock;
    satisfied: boolean;
}
