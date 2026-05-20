import { Module } from "@nestjs/common";
import { DatabaseService } from "./db/database.service.js";
import { HealthController } from "./health.controller.js";
import { DashboardController } from "./modules/dashboard.controller.js";
import { ImportController } from "./modules/import.controller.js";
import { ImportService } from "./modules/import.service.js";
import { KeywordController } from "./modules/keyword.controller.js";
import { KeywordService } from "./modules/keyword.service.js";
import { RuleService } from "./modules/rule.service.js";

@Module({
  controllers: [HealthController, DashboardController, KeywordController, ImportController],
  providers: [DatabaseService, KeywordService, RuleService, ImportService]
})
export class AppModule {}
