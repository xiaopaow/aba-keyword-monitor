import { Module } from "@nestjs/common";
import { DatabaseService } from "./db/database.service.js";
import { HealthController } from "./health.controller.js";
import { AbaController } from "./modules/aba.controller.js";
import { AbaService } from "./modules/aba.service.js";
import { DashboardController } from "./modules/dashboard.controller.js";
import { ImportController } from "./modules/import.controller.js";
import { ImportService } from "./modules/import.service.js";
import { KeywordController } from "./modules/keyword.controller.js";
import { KeywordService } from "./modules/keyword.service.js";
import { RuleService } from "./modules/rule.service.js";

@Module({
  controllers: [HealthController, AbaController, DashboardController, KeywordController, ImportController],
  providers: [DatabaseService, AbaService, KeywordService, RuleService, ImportService]
})
export class AppModule {}
