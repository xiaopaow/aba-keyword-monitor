import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthGuard } from "./auth.guard.js";
import { AuthService, getAuthenticatedUser, getDeviceFingerprint } from "./auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  login(
    @Body() body: { email?: string; password?: string; deviceFingerprint?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const deviceFingerprint = body.deviceFingerprint || getDeviceFingerprint(req);
    return this.auth.login(body.email ?? "", body.password ?? "", deviceFingerprint, req, res);
  }

  @Post("register")
  register(
    @Body() body: { email?: string; password?: string; deviceFingerprint?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const deviceFingerprint = body.deviceFingerprint || getDeviceFingerprint(req);
    return this.auth.register(body.email ?? "", body.password ?? "", deviceFingerprint, req, res);
  }

  @Post("logout")
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req, res);
  }

  @Get("me")
  me(@Req() req: Request) {
    return this.auth.currentUser(req);
  }

  @UseGuards(AuthGuard)
  @Post("copy-log")
  async logCopy(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const user = getAuthenticatedUser(req);
    await this.auth.consumeQuota(user, "copy", req, body);
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @Post("orders")
  async createOrder(@Body() body: { plan?: "basic" | "pro" }, @Req() req: Request) {
    const user = getAuthenticatedUser(req);
    return this.auth.createOrder(user, body.plan ?? "basic", req);
  }
}
