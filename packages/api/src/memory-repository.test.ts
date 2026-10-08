import { MemoryLinkRepository } from "./memory-repository.ts";
import { describeRepositoryContract } from "./repository.contract.ts";

describeRepositoryContract("memory", async () => new MemoryLinkRepository());
