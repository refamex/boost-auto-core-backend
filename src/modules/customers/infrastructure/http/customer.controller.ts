import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { CurrentUser } from '../../../../shared/common/decorators/current-user.decorator';
import { Roles } from '../../../../shared/common/decorators/roles.decorator';
import { CustomerBranchService } from '../../application/services/customer-branch.service';
import { CustomerProfileService } from '../../application/services/customer-profile.service';
import {
  CreateCustomerBranchDto,
  CreateCustomerDto,
  CustomerQueryDto,
  LinkCustomerDto,
  ReassignCustomerOwnerDto,
  UpdateCustomerBranchDto,
  UpdateCustomerDto,
} from './dto/customer.dto';

@ApiTags('customers')
@ApiBearerAuth()
@Controller({ path: 'customers', version: '1' })
export class CustomerController {
  constructor(
    private readonly customers: CustomerProfileService,
    private readonly branches: CustomerBranchService,
  ) {}

  @Get()
  @Roles('customers:read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CustomerQueryDto,
  ) {
    return this.customers.list(user, query);
  }

  @Post()
  @Roles('customers:write')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customers.create(user, dto);
  }

  // -------- self-service address book (customer tier) --------
  //
  // UNGATED ON PURPOSE, the same shape as `GET /v1/quotes/me`. The macro role
  // `customer` grants neither `customers:read` nor `customers:write`, so
  // `@Roles(...)` here would 403 a shopper before ownership is ever evaluated —
  // and granting them those permissions would ALSO open the unfiltered staff
  // routes below. Scope comes from `auth_customer_id = user.id`; these routes
  // take no caller-supplied customer id at all.
  //
  // DECLARED FIRST because `me/branches` also matches `:customerId/branches`,
  // and Nest/Express resolves in declaration order.

  @Get('me/branches')
  async listMyBranches(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.customers.findByAuthCustomerId(user.id);
    // No profile yet is not an error: it means "you have saved no addresses".
    // A 404 here would make the account screen look broken to every shopper
    // who has not shipped anything yet.
    return profile ? this.branches.listByProfile(profile.id) : [];
  }

  @Post('me/branches')
  async createMyBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerBranchDto,
  ) {
    const profile = await this.customers.ensureSelfServiceProfile(user);
    return this.branches.create(profile.id, dto);
  }

  @Patch('me/branches/:branchId')
  async updateMyBranch(
    @Param('branchId') branchId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCustomerBranchDto,
  ) {
    // `CustomerBranchService` re-checks ownership through `isVisibleToUser`,
    // which now recognises the profile's own customer — so a branch id
    // belonging to somebody else 404s rather than being edited.
    return this.branches.update(branchId, user, dto);
  }

  @Delete('me/branches/:branchId')
  @HttpCode(204)
  async removeMyBranch(
    @Param('branchId') branchId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.branches.remove(branchId, user);
  }

  // Action and nested routes are declared before the bare `:id` routes:
  // Nest/Express matches in declaration order.
  @Post(':id/link')
  @Roles('customers:write')
  link(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LinkCustomerDto,
  ) {
    return this.customers.link(id, user, dto.authCustomerId);
  }

  @Patch(':id/owner')
  @Roles('customers:admin')
  reassignOwner(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReassignCustomerOwnerDto,
  ) {
    return this.customers.reassignOwner(id, user, dto);
  }

  // -------- branches (profile-scoped route prefix + loadOwnedProfile) --------

  @Get(':customerId/branches')
  @Roles('customers:read')
  async listBranches(
    @Param('customerId') customerId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.loadOwnedProfile(customerId, user);
    return this.branches.listByProfile(customerId);
  }

  @Post(':customerId/branches')
  @Roles('customers:write')
  async createBranch(
    @Param('customerId') customerId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerBranchDto,
  ) {
    await this.loadOwnedProfile(customerId, user);
    return this.branches.create(customerId, dto);
  }

  @Patch(':customerId/branches/:branchId')
  @Roles('customers:write')
  async updateBranch(
    @Param('customerId') customerId: string,
    @Param('branchId') branchId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCustomerBranchDto,
  ) {
    await this.loadOwnedProfile(customerId, user);
    return this.branches.update(branchId, user, dto);
  }

  @Delete(':customerId/branches/:branchId')
  @Roles('customers:write')
  @HttpCode(204)
  async removeBranch(
    @Param('customerId') customerId: string,
    @Param('branchId') branchId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.loadOwnedProfile(customerId, user);
    await this.branches.remove(branchId, user);
  }

  @Get(':id')
  @Roles('customers:read')
  findById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.customers.findById(id, user);
  }

  @Patch(':id')
  @Roles('customers:write')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(id, user, dto);
  }

  /** 404s (never 403) when `customerId` doesn't exist or is outside scope. */
  private loadOwnedProfile(customerId: string, user: AuthenticatedUser) {
    return this.customers.findById(customerId, user);
  }
}
