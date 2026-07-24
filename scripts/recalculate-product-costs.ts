import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
import { recalculateProductCosts } from "@/services/resource.service";

loadEnvConfig(process.cwd());

const result = await recalculateProductCosts();
console.log(JSON.stringify(result, null, 2));
await mongoose.disconnect();
