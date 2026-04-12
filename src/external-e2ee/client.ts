export interface ExternalE2eeApiProvider<
  TConfig,
  TSession,
  TProject,
  TTask,
  TProjectQuery = undefined,
  TTaskQuery = undefined,
> {
  authenticate(config: TConfig): Promise<TSession>;
  listProjects(
    config: TConfig,
    session: TSession,
    query?: TProjectQuery,
  ): Promise<TProject[]>;
  listTasks(
    config: TConfig,
    session: TSession,
    query?: TTaskQuery,
  ): Promise<TTask[]>;
  validateAccess?(config: TConfig, session: TSession): Promise<void>;
}

export class ExternalE2eeApiClient<
  TConfig,
  TSession,
  TProject,
  TTask,
  TProjectQuery = undefined,
  TTaskQuery = undefined,
> {
  public constructor(
    private readonly provider: ExternalE2eeApiProvider<
      TConfig,
      TSession,
      TProject,
      TTask,
      TProjectQuery,
      TTaskQuery
    >,
  ) {}

  public authenticate(config: TConfig): Promise<TSession> {
    return this.provider.authenticate(config);
  }

  public async ensureAccess(config: TConfig): Promise<void> {
    const session = await this.provider.authenticate(config);
    if (this.provider.validateAccess) {
      await this.provider.validateAccess(config, session);
    }
  }

  public async listProjects(
    config: TConfig,
    query?: TProjectQuery,
  ): Promise<TProject[]> {
    const session = await this.provider.authenticate(config);
    return this.provider.listProjects(config, session, query);
  }

  public async listTasks(config: TConfig, query?: TTaskQuery): Promise<TTask[]> {
    const session = await this.provider.authenticate(config);
    return this.provider.listTasks(config, session, query);
  }
}

export function createExternalE2eeApiClient<
  TConfig,
  TSession,
  TProject,
  TTask,
  TProjectQuery = undefined,
  TTaskQuery = undefined,
>(
  provider: ExternalE2eeApiProvider<
    TConfig,
    TSession,
    TProject,
    TTask,
    TProjectQuery,
    TTaskQuery
  >,
): ExternalE2eeApiClient<
  TConfig,
  TSession,
  TProject,
  TTask,
  TProjectQuery,
  TTaskQuery
> {
  return new ExternalE2eeApiClient(provider);
}