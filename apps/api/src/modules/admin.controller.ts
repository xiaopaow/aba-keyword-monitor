import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AdminGuard } from "./admin.guard.js";
import { AuthService } from "./auth.service.js";

@Controller("admin")
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly auth: AuthService) {}

  @Get("members")
  listMembers(
    @Query("query") query?: string,
    @Query("plan") plan?: string,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ) {
    return this.auth.listMembersForAdmin({
      query,
      plan,
      status,
      page: Number(page ?? 1),
      pageSize: Number(pageSize ?? 20)
    });
  }

  @Patch("members/:id")
  updateMember(
    @Param("id") id: string,
    @Body() body: { plan?: string; status?: string; expiresAt?: string | null; extendDays?: number }
  ) {
    return this.auth.updateMemberForAdmin(Number(id), body);
  }

  @Post("members/:id/revoke-sessions")
  revokeSessions(@Param("id") id: string) {
    return this.auth.revokeMemberSessionsForAdmin(Number(id));
  }
}
