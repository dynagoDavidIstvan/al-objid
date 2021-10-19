export interface Predicate<T> {
    (next: T): boolean | symbol;
}
