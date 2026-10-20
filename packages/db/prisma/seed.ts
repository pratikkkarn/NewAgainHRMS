import { Prisma, PrismaClient, UserStatus } from '@prisma/client';
import { LOCKED_ROLES, Password, ROLE_DEFAULTS, RoleKey, RoleLabel } from '@primestar/shared';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();


/**
 * Company details printed on invoices and proformas. These are the sample values from the
 * frontend's proforma template, so replace them with Prime Star's real details in Settings.
 * `state` is the GST state code that drives IGST vs CGST + SGST.
 */
const COMPANY = {
  legalName: 'Prime Star Consulting Services Pvt. Ltd.',
  address: 'Tower B, 4th Floor, Prestige Tech Park, Outer Ring Road, Marathahalli, Bengaluru, Karnataka, 560103, India',
  state: 'Karnataka',
  stateCode: '29',
  gstin: '29AABCP1234F1Z5',
  pan: 'ABCPS1234F',
  cin: 'U72200KA2019PTC123456',
  email: 'billing@primestarconsulting.com',
  phone: '+91 80 4000 8888',
  defaultSac: '998313',
  paymentTermsDays: 30,
  bank: {
    bankName: 'HDFC Bank Ltd.',
    accountName: 'Prime Star Consulting Services Pvt. Ltd.',
    accountNumber: '50200084920192',
    ifsc: 'HDFC0000128',
    branch: 'Koramangala 4th Block, Bengaluru - 560034',
  },
  /** Invoice numbers look like PS/2026-27/0001. Counters live in NumberCounter, per financial year. */
  numberFormats: {
    INVOICE: 'PS/{fy}/{seq:4}',
    CREDIT_NOTE: 'PS/CN/{fy}/{seq:4}',
    PROFORMA: 'PS/PF/{fy}/{seq:4}',
  },
} satisfies Prisma.InputJsonObject;

/**
 * Development accounts, one per role, all with the same password, so each role can be tried with one click
 * (the login page has role buttons in development). They are real accounts and go through the real sign-in.
 * Turned on only by SEED_DEV_USERS=true, with the password in SEED_DEV_PASSWORD, and refused in production.
 */
const DEV_USERS: { email: string; name: string; role: RoleKey }[] = [
  { email: 'ceo@primestar.test', name: 'Rajesh Sharma', role: 'CEO' },
  { email: 'hr.head@primestar.test', name: 'Priya Sundaram', role: 'HR_HEAD' },
  { email: 'hr@primestar.test', name: 'Ananya Roy', role: 'HR_EXECUTIVE' },
  { email: 'finance@primestar.test', name: 'Vikramaditya Rao', role: 'FINANCE_MANAGER' },
  { email: 'po.admin@primestar.test', name: 'Kavita Nair', role: 'PO_ADMIN' },
  { email: 'pm@primestar.test', name: 'Siddharth Mehta', role: 'PROJECT_MANAGER' },
  { email: 'employee@primestar.test', name: 'Rohan Deshmukh', role: 'EMPLOYEE' },
];

async function seedDevUsers(): Promise<string> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('SEED_DEV_USERS must never be used in production.');
  }
  const password = process.env['SEED_DEV_PASSWORD'];
  if (!password) throw new Error('SEED_DEV_USERS=true needs SEED_DEV_PASSWORD.');
  const strong = Password.safeParse(password);
  if (!strong.success) throw new Error(`SEED_DEV_PASSWORD is too weak. ${strong.error.issues[0]?.message ?? ''}`);

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  for (const { email, name, role } of DEV_USERS) {
    const roleRow = await prisma.role.findUniqueOrThrow({ where: { key: role } });
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, name, status: UserStatus.ACTIVE, passwordHash },
      update: {
        name,
        passwordHash,
        status: UserStatus.ACTIVE,
        failedLoginCount: 0,
        lockedUntil: null,
        mustChangePassword: false,
        inviteTokenHash: null,
        inviteExpiresAt: null,
        resetTokenHash: null,
        resetExpiresAt: null,
      },
    });
    // Exactly one role each, so a role button always tests that role and nothing else.
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: roleRow.id } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
  }
  return `${DEV_USERS.length} development accounts (one per role) are active with the shared dev password.`;
}

/**
 * The first CEO, taken from the environment so no password is ever written in code:
 *   SEED_CEO_EMAIL, SEED_CEO_NAME (optional), SEED_CEO_PASSWORD.
 * Everyone else is created by the CEO in Users & Roles. Without these variables no account is created.
 * An existing CEO account is left alone unless SEED_CEO_RESET_PASSWORD=true.
 */
async function seedCeo(ceoRoleId: string): Promise<string> {
  const email = process.env['SEED_CEO_EMAIL']?.trim().toLowerCase();
  const password = process.env['SEED_CEO_PASSWORD'];
  if (!email || !password) return 'No CEO account created: set SEED_CEO_EMAIL and SEED_CEO_PASSWORD to create one.';

  const strong = Password.safeParse(password);
  if (!strong.success) throw new Error(`SEED_CEO_PASSWORD is too weak. ${strong.error.issues[0]?.message ?? ''}`);

  const name = process.env['SEED_CEO_NAME']?.trim() || 'CEO';
  const existing = await prisma.user.findUnique({ where: { email } });
  const reset = process.env['SEED_CEO_RESET_PASSWORD'] === 'true';
  if (existing && !reset) return `CEO account ${email} already exists; left unchanged.`;

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, status: UserStatus.ACTIVE, passwordHash },
    update: {
      passwordHash,
      status: UserStatus.ACTIVE,
      failedLoginCount: 0,
      lockedUntil: null,
      mustChangePassword: false,
      inviteTokenHash: null,
      inviteExpiresAt: null,
      resetTokenHash: null,
      resetExpiresAt: null,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: ceoRoleId } },
    create: { userId: user.id, roleId: ceoRoleId },
    update: {},
  });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  return existing ? `CEO account ${email} reset to the SEED_CEO_PASSWORD.` : `CEO account ${email} created.`;
}

/** Seeds roles, settings and the first CEO. Safe to run repeatedly; it never overwrites edits. */
async function main(): Promise<void> {
  for (const key of RoleKey.options) {
    const isLocked = LOCKED_ROLES.includes(key);
    await prisma.role.upsert({
      where: { key },
      create: { key, name: RoleLabel[key], permissions: [...ROLE_DEFAULTS[key]], isSystem: true, isLocked },
      // A locked role always follows the defaults. Other roles keep any edits admins made.
      update: isLocked ? { permissions: [...ROLE_DEFAULTS[key]], isLocked } : {},
    });
  }

  const settings: Record<string, Prisma.InputJsonValue> = {
    'alerts.poExpiryDays': 60,
    'alerts.poRunOutDays': 60,
    'alerts.milestoneDays': [60, 7],
    'alerts.repeatWeekly': true,
    'alerts.dailyScanCron': '0 9 * * *',
    'alerts.timezone': 'Asia/Kolkata',
    company: COMPANY,
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: {} });
  }

  const ceoRole = await prisma.role.findUniqueOrThrow({ where: { key: 'CEO' } });
  // Development accounts include the CEO, so the single-CEO path only runs without them.
  const ceoMessage = process.env['SEED_DEV_USERS'] === 'true' ? await seedDevUsers() : await seedCeo(ceoRole.id);

  await prisma.auditLog.create({
    data: {
      entityType: 'System',
      entityId: '00000000-0000-7000-8000-000000000000',
      action: 'System setup',
      reason: `Seeded ${RoleKey.options.length} roles and ${Object.keys(settings).length} settings. ${ceoMessage}`,
    },
  });

  console.log(`Seeded ${RoleKey.options.length} roles and ${Object.keys(settings).length} settings.`);
  console.log(ceoMessage);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
