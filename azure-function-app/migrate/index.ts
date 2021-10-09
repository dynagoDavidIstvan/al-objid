import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import { Blob } from "@vjeko.com/azure-func";
import { ALObjectType } from "../src/functions/v2/ALObjectType";

const FROM_CONTAINER = process.env.MigrateFromContainer;
const FROM_STORAGE = "MigrateFromStorage";
const TO_CONTAINER = process.env.MigrateToContainer;
const TO_STORAGE = "MigrateToStorage";

function writeDataToObject(target: any, key: string, data: any) {
    if (!data) {
        return;
    }
    target[key] = data;
}

async function readContents(path: string | Blob<any>): Promise<any> {
    const blob = (path instanceof Blob) ? path : new Blob(path, FROM_CONTAINER, FROM_STORAGE);
    const result = await blob.read();
    return result;
}

async function migrateV1toV2(appId: string): Promise<boolean> {
    let rangesBlob = new Blob<any>(`${appId}/_ranges.json`, FROM_CONTAINER, FROM_STORAGE);
    let authBlob = new Blob<any>(`${appId}/_authorization.json`, FROM_CONTAINER, FROM_STORAGE);
    if (!await rangesBlob.lock() && !await authBlob.lock()) {
        return false;
    }

    try {
        let app = {};
        let promises = [];
        for (let objectType of Object.values(ALObjectType)) {
            promises.push(readContents(`${appId}/${objectType}.json`).then(data => writeDataToObject(app, objectType, data)));
        }
        promises.push(authBlob.read().then(data => writeDataToObject(app, "_authorization", data)));
        promises.push(rangesBlob.read().then(data => writeDataToObject(app, "_ranges", data)));
        await Promise.all(promises);
        let appBlob = new Blob(`${appId}.json`, TO_CONTAINER, TO_STORAGE);
        await appBlob.optimisticUpdate(() => app);
        authBlob.unlock();
        rangesBlob.unlock();
        return true;
    } catch (e) {
        authBlob.unlock();
        rangesBlob.unlock();
        return false;
    }
}

async function isV2(appId: string): Promise<boolean> {
    let rangesBlob = new Blob<any>(`${appId}/_ranges.json`);
    let authBlob = new Blob<any>(`${appId}/_authorization.json`);
    if (await rangesBlob.exists() || await authBlob.exists()) {
        return true;
    }
}

async function migrateAll(context: Context) {
    let blob = new Blob<any>("", FROM_CONTAINER, FROM_STORAGE);
    let token = null;
    let data = [];
    while (true) {
        let results = await blob.readAll(token);
        token = results.continuationToken;
        data.push(...results.entries);
        if (!token) break;
    }

    const apps = [];
    for (let entry of data) {
        let parts = entry.name.split("/");
        if (parts.length > 1 && !apps.includes(parts[0])) {
            apps.push(parts[0]);
        }
    }
    context.res = { body: apps };

    for (let i = 0; i < apps.length; i++) {
        await migrateV1toV2(apps[i]);
    }
}

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    const start = Date.now();
    await migrateAll(context);

    context.res.body.doneIn = Date.now() - start;
};

export default httpTrigger;
