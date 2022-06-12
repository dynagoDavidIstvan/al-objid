import { Mock } from "@vjeko.com/azure-func-test";
import * as azure from "azure-storage";
import { Blob } from "@vjeko.com/azure-func";
import { StubStorage } from "../AzureTestLibrary/v2/Storage.stub";
import { disableRemoveFromPoolRateLimit, run as removeFromPool } from "../../src/functions/v2/removeFromPool";
import { disableCreatePoolRateLimit, run as createPool } from "../../src/functions/v2/createPool";
import { initializeCustomMatchers } from "../AzureTestLibrary/CustomMatchers";
import { CreatePoolResponse } from "../../src/functions/v2/createPool/types";
import { decrypt } from "../../src/common/Encryption";
import { createPrivateKey, createSign } from "crypto";

jest.mock("azure-storage");
Blob.injectCreateBlobService(azure.createBlobService);
Mock.initializeStorage(azure.createBlobService);
initializeCustomMatchers();
disableCreatePoolRateLimit();
disableRemoveFromPoolRateLimit();

describe("Testing function api/v2/removeFromPool", () => {
    const name = "_mock_pool_";
    const existingApps = [
        { appId: "_existing_mock_1_", name: "ExistingMock1" },
        { appId: "_existing_mock_2_", name: "ExistingMock2" }
    ];
    const leaveApps = [
        { appId: "id1", name: "app #1" },
        { appId: "id2", name: "app #2" },
    ];
    const managementSecret = "_mock_management_secret";
    const joinKey = "_mock_join_key_";

    async function createMockPool(storage: StubStorage, initialApps: { appId: string, name: string }[] = []): Promise<CreatePoolResponse> {
        Mock.useStorage(storage.content);
        const context = new Mock.Context(new Mock.Request("POST", { name, managementSecret, joinKey, apps: initialApps }));
        await createPool(context, context.req);
        return context.res.body as CreatePoolResponse;
    }

    function signPayload(payload: {}, key: string): { _payload: string, _signature: string } {
        const privateKey = createPrivateKey({ key: Buffer.from(key, "base64"), format: "der", passphrase: managementSecret, type: "pkcs8" });
        const _payload = JSON.stringify(payload);
        const sign = createSign("RSA-SHA256");
        sign.write(_payload);
        sign.end();
        const _signature = sign.sign(privateKey, "base64");
        return {
            ...payload,
            _payload,
            _signature,
        };
    }

    it("Fails removing apps from pool with invalid info (missing body)", async () => {
        const storage = new StubStorage();
        Mock.useStorage(storage.content);
        const context = new Mock.Context(new Mock.Request("POST", {}));
        await removeFromPool(context, context.req);
        expect(context.res).toBeStatus(400);
    });

    it("Fails removing apps from pool with invalid info (invalid poolId type)", async () => {
        const storage = new StubStorage();
        Mock.useStorage(storage.content);
        const context = new Mock.Context(new Mock.Request("POST", { poolId: 3.14 }));
        await removeFromPool(context, context.req);
        expect(context.res).toBeStatus(400);
    });

    it("Fails removing apps from pool with invalid info (invalid accessKey type)", async () => {
        const storage = new StubStorage();
        Mock.useStorage(storage.content);
        const context = new Mock.Context(new Mock.Request("POST", { poolId: "_mock_", accessKey: 3.14 }));
        await removeFromPool(context, context.req);
        expect(context.res).toBeStatus(400);
    });

    it("Fails removing apps from pool with invalid info (missing apps)", async () => {
        const storage = new StubStorage();
        Mock.useStorage(storage.content);
        const context = new Mock.Context(new Mock.Request("POST", { poolId: "_mock_", accessKey: "_mock_key_" }));
        await removeFromPool(context, context.req);
        expect(context.res).toBeStatus(400);
    });

    it("Fails removing apps from pool for a non-existent pool", async () => {
        const storage = new StubStorage();
        Mock.useStorage(storage.content);

        const context = new Mock.Context(new Mock.Request("POST", { poolId: "_mock_", accessKey: "invalid", apps: leaveApps }));
        await removeFromPool(context, context.req);
        expect(context.res).toBeStatus(404);
    });

    it("Fails removing apps from pool for a non-pool app", async () => {
        const storage = new StubStorage().app("_mock_");
        Mock.useStorage(storage.content);

        const pool = await createMockPool(storage, existingApps);
        const { accessKey, managementKey } = pool;

        const context = new Mock.Context(new Mock.Request("POST", signPayload({ poolId: "_mock_", accessKey, apps: leaveApps }, managementKey)));
        await removeFromPool(context, context.req);
        expect(context.res).toBeStatus(405);
    });

    it("Fails removing apps from pool for an app that's not in the pool", async () => {
        const storage = new StubStorage();
        Mock.useStorage(storage.content);

        const pool = await createMockPool(storage, existingApps);
        const { poolId, accessKey, managementKey } = pool;

        const context = new Mock.Context(new Mock.Request("POST", signPayload({ poolId, accessKey, apps: leaveApps }, managementKey)));

        await removeFromPool(context, context.req);
        expect(context.res).toBeStatus(409);
    });

    it("Fails removing apps from pool with invalid accessKey", async () => {
        const storage = new StubStorage();
        Mock.useStorage(storage.content);

        const pool = await createMockPool(storage, existingApps);
        const { poolId, managementKey } = pool;

        const context = new Mock.Context(new Mock.Request("POST", signPayload({ poolId, accessKey: "invalid_key", apps: [existingApps[0]] }, managementKey)));
        await removeFromPool(context, context.req);
        expect(context.res).toBeStatus(401);
    });

    it("Succeeds removing apps from pool with valid accessKey", async () => {
        const storage = new StubStorage();
        Mock.useStorage(storage.content);

        const pool = await createMockPool(storage, existingApps);
        const { poolId, accessKey, managementKey } = pool;
        const createdPool = storage.content[`${poolId}.json`]._pool;
        const leaveKey = createdPool.leaveKeys[createdPool.appIds[0]];
        const leaveKeyRemaining = createdPool.leaveKeys[createdPool.appIds[1]];

        const context = new Mock.Context(new Mock.Request("POST", signPayload({ poolId, accessKey, apps: [{ ...existingApps[0], leaveKey }] }, managementKey)));
        await removeFromPool(context, context.req);
        expect(context.res).toBeStatus(200);

        const app = storage.content[`${poolId}.json`];
        expect(app._pool).toBeDefined();
        expect(app._pool.info).toBeDefined();

        const info = JSON.parse(decrypt(app._pool.info, accessKey));
        expect(info.name).toStrictEqual(name);
        expect(info.apps.length).toStrictEqual(existingApps.length - 1);
        expect(info.apps[0]).toEqual(existingApps[1]);
        expect(app._pool.appIds.length).toStrictEqual(existingApps.length - 1);
        expect(app._pool.appIds[0]).toStrictEqual(existingApps[1].appId);
        expect(Object.keys(app._pool.leaveKeys).length).toStrictEqual(existingApps.length - 1);
        expect(app._pool.leaveKeys[existingApps[1].appId]).toStrictEqual(leaveKeyRemaining);
    });

});
