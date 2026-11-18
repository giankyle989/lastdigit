-- Existing admins become superadmins; managers are new.
ALTER TYPE "Role" RENAME VALUE 'ADMIN' TO 'SUPERADMIN';
ALTER TYPE "Role" ADD VALUE 'MANAGER';
