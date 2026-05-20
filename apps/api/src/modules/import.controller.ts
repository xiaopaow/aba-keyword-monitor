import { Controller, Get, Param, Post, UploadedFile, UseInterceptors, Body } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { mkdirSync } from "node:fs";
import { extname } from "node:path";
import { ImportService } from "./import.service.js";

@Controller("import")
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Post("create")
  create(@Body() body: { fileName: string; reportDate: string }) {
    return this.imports.createTask(body.fileName, body.reportDate);
  }

  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_req, _file, callback) => {
          const dir = process.env.UPLOAD_DIR ?? "uploads";
          mkdirSync(dir, { recursive: true });
          callback(null, dir);
        },
        filename: (_req, file, callback) => {
          callback(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${extname(file.originalname)}`);
        }
      })
    })
  )
  async upload(@UploadedFile() file: Express.Multer.File, @Body("reportDate") reportDate: string) {
    await this.imports.ensureUploadDir();
    return this.imports.upload(file, reportDate);
  }

  @Get("tasks/:taskId")
  task(@Param("taskId") taskId: string) {
    return this.imports.getTask(Number(taskId));
  }
}
