import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { WorkplaceService } from '../src/modules/workplace/workplace.service';
import { WorkplaceModel } from '../src/modules/workplace/workplace.model';
import { WorkplaceMemberModel } from '../src/modules/employee/workplace-member.model';
import { TeamModel } from '../src/modules/team/team.model';
import { teamService } from '../src/modules/team/team.service';
import { EmployeeService } from '../src/modules/employee/employee.service';
import { UserModel } from '../src/modules/auth/user.model';

let mongo: MongoMemoryReplSet;
const wpService = new WorkplaceService();
const empService = new EmployeeService();

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    WorkplaceModel.init(),
    WorkplaceMemberModel.init(),
    TeamModel.init(),
    UserModel.init(),
  ]);
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('Workplace -> Team -> Team Members hierarchy flow', async () => {
  // 1. Create employer and workplace
  const employer = await UserModel.create({ name: 'Employer Alice', email: 'alice@corp.com', status: 'ACTIVE' });
  const { workplace, member: employerMember, team: defaultTeam } = await wpService.createWorkplace(employer.id, {
    name: 'Tech Ventures',
  });

  // Strict BWP-****-*** format
  assert.ok(workplace.workplaceCode);
  assert.match(workplace.workplaceCode, /^BWP-\d{4}-\d{3}$/);

  // Default team was automatically created
  assert.equal(defaultTeam.name, 'General');
  assert.equal(defaultTeam.isDefault, true);

  // 2. Create additional teams
  const engTeam = await teamService.createTeam(workplace.id, employer.id, {
    name: 'Engineering',
    description: 'Devs & QA',
    color: '#3B82F6',
  });
  assert.equal(engTeam.name, 'Engineering');
  assert.equal(engTeam.isDefault, false);

  const salesTeam = await teamService.createTeam(workplace.id, employer.id, {
    name: 'Sales & Ops',
    color: '#10B981',
  });
  assert.equal(salesTeam.name, 'Sales & Ops');

  // 3. Add employees to specific teams
  const { employee: dev1 } = await empService.addEmployee(workplace.id, employer.id, {
    name: 'Bob Dev',
    email: 'bob@corp.com',
    teamId: engTeam.id,
  });
  assert.ok(dev1);

  const { employee: dev2 } = await empService.addEmployee(workplace.id, employer.id, {
    name: 'Charlie Dev',
    email: 'charlie@corp.com',
    teamId: engTeam.id,
  });
  assert.ok(dev2);

  const { employee: sales1 } = await empService.addEmployee(workplace.id, employer.id, {
    name: 'Diana Sales',
    email: 'diana@corp.com',
    teamId: salesTeam.id,
  });
  assert.ok(sales1);

  // 4. Verify teams listing returns proper hierarchy
  const teamsList = await teamService.getTeams(workplace.id);
  assert.equal(teamsList.length, 3); // General, Engineering, Sales & Ops

  const engTeamData = teamsList.find((t) => t.name === 'Engineering');
  assert.ok(engTeamData);
  assert.equal(engTeamData.memberCount, 2);

  const salesTeamData = teamsList.find((t) => t.name === 'Sales & Ops');
  assert.ok(salesTeamData);
  assert.equal(salesTeamData.memberCount, 1);

  // 5. Reassign employee from one team to another
  await teamService.assignMemberToTeam(workplace.id, salesTeam.id, dev2.id);
  const updatedTeams = await teamService.getTeams(workplace.id);
  const updatedEng = updatedTeams.find((t) => t.name === 'Engineering');
  const updatedSales = updatedTeams.find((t) => t.name === 'Sales & Ops');
  assert.equal(updatedEng?.memberCount, 1);
  assert.equal(updatedSales?.memberCount, 2);
});
