import { describe, expect, it, vi } from "vitest";
import { createGraphqlTransport, GraphqlCrudAdapter } from "../src/adapters/graphql";
import { createFetchRestTransport, RestCrudAdapter } from "../src/adapters/rest";

describe("GraphQL transport and adapter", () => {
  it("runs query and mutation operations through the executor", async () => {
    const executor = vi
      .fn()
      .mockImplementation(async ({ kind, variables }) => {
        if (kind === "query") {
          return { dashboards: [{ id: variables?.["id"] ?? "dashboard-1", name: "Main" }] };
        }

        return { updateDashboard: { id: variables?.["id"], name: variables?.["name"] } };
      });
    const transport = createGraphqlTransport(executor);
    const adapter = new GraphqlCrudAdapter(transport, {
      getById: {
        buildVariables: (id: string) => ({ id }),
        document: "DashboardQuery",
        select: (result) => (result as { dashboards: { id: string; name: string }[] }).dashboards[0] ?? null,
      },
      update: {
        buildVariables: (id: string, input: { id: string; name: string }) => ({
          id,
          name: input.name,
        }),
        document: "UpdateDashboardMutation",
        select: (result) => (result as { updateDashboard: { id: string; name: string } }).updateDashboard,
      },
    });

    expect(await adapter.getById("dashboard-7")).toEqual({
      id: "dashboard-7",
      name: "Main",
    });
    expect(
      await adapter.update("dashboard-7", { id: "dashboard-7", name: "Renamed" }),
    ).toEqual({
      id: "dashboard-7",
      name: "Renamed",
    });
    expect(executor).toHaveBeenCalledTimes(2);
  });
});

describe("REST transport and adapter", () => {
  it("builds URLs and JSON requests via fetch", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ id: "integration-1", displayName: "Plandera" }), {
        headers: {
          "Content-Type": "application/json",
        },
        status: 200,
      }),
    );
    const transport = createFetchRestTransport({
      baseUrl: "https://api.example.test/v1",
      fetch: fetchMock,
    });
    const adapter = new RestCrudAdapter(transport, {
      getById: {
        path: (id: string) => `/integrations/${id}`,
      },
      update: {
        path: (id: string) => `/integrations/${id}`,
      },
    });

    expect(await adapter.getById("integration-1")).toEqual({
      id: "integration-1",
      displayName: "Plandera",
    });
    await adapter.update("integration-1", {
      displayName: "Updated",
      id: "integration-1",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL("integrations/integration-1", "https://api.example.test/v1/"),
      {
        headers: new Headers(),
        method: "GET",
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL("integrations/integration-1", "https://api.example.test/v1/"),
      {
        body: JSON.stringify({ displayName: "Updated", id: "integration-1" }),
        headers: new Headers({ "Content-Type": "application/json" }),
        method: "PUT",
      },
    );
  });
});