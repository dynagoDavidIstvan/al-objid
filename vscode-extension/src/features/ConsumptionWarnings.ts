import { ConsumptionData } from "../lib/BackendTypes";
import { PropertyBag } from "../lib/PropertyBag";
import { getCachedManifestFromAppId } from "../lib/__AppManifest_obsolete_";
import { UI } from "../lib/UI";
import { LABELS } from "../lib/constants";
import { ExtensionContext } from "vscode";

export class ConsumptionWarnings {
    //#region Singleton
    private static _instance: ConsumptionWarnings;

    private constructor() {}

    public static get instance(): ConsumptionWarnings {
        return this._instance || (this._instance = new ConsumptionWarnings());
    }
    //#endregion

    private _context?: ExtensionContext;
    private _shownWarnings: PropertyBag<boolean> = {};
    private _warningLevels: PropertyBag<number> = {};

    private async showWarning(appId: string, type: string, remaining: number) {
        const warningId = `consumption-warning.${appId}.${type}`;
        if (this._context!.globalState.get(warningId)) {
            return;
        }
        if (this._shownWarnings[warningId]) {
            return;
        }
        if (this._warningLevels[warningId] === remaining) {
            return;
        }
        this._warningLevels[warningId] = remaining;
        this._shownWarnings[warningId] = true;
        const manifest = getCachedManifestFromAppId(appId);
        const result = await UI.nextId.showNumbersAboutToRunOut(manifest.name, type, remaining);
        delete this._shownWarnings[warningId];

        if (result === LABELS.BUTTON_DONT_SHOW_AGAIN) {
            UI.nextId.showDisabledOnlyForAppAndType(manifest.name, type);
            this._context!.globalState.update(warningId, true);
        }
    }

    public checkRemainingIds(appId: string, consumption: ConsumptionData) {
        const manifest = getCachedManifestFromAppId(appId);
        if (!manifest) {
            // TODO Notifications for app pools are not handled at the moment
            return;
        }

        const available = manifest.idRanges.reduce(
            (previous, current) => previous + Math.max(current.to - current.from, 0) + 1,
            0
        );

        // The formula below will work like this:
        // - At minimum, when 5 or fewer objects are available, warning pops up
        // - When consumption is at 95% of available range and more than 5 objects are available, warning pops up
        // - If there are still more than 25 objects available, no warning will pop up regardless of above
        const warningLevel = Math.max(Math.min(available * 0.95, available - 5), available - 25);

        for (let type of Object.keys(consumption)) {
            const total = (consumption as any)[type].filter(
                (id: number) =>
                    manifest.idRanges.filter(range => range.from <= id && range.to >= id).length > 0
            ).length;
            if (total >= warningLevel) {
                this.showWarning(appId, type, available - total);
            }
        }
    }

    public setContext(context: ExtensionContext) {
        this._context = context;
    }
}
