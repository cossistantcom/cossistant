import { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { createTRPCRouter } from "../init";

import { userRouter } from "./user";
import { websiteRouter } from "./website";

export const origamiTRPCRouter = createTRPCRouter({
  user: userRouter,
  website: websiteRouter,
});

// export type definition of API
export type OrigamiTRPCRouter = typeof origamiTRPCRouter;
export type OrigamiTRPCRouterOutputs = inferRouterOutputs<OrigamiTRPCRouter>;
export type OrigamiTRPCRouterInputs = inferRouterInputs<OrigamiTRPCRouter>;
