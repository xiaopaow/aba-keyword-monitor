import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { AuthService } from "./auth.service.js";

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const row = await this.auth.validateRequest(request, true);
    if (!row) return false;

    const user = this.auth.publicUser(row);
    if (user.role !== "admin") throw new ForbiddenException("需要管理员权限。");
    request.abaUser = user;
    return true;
  }
}
