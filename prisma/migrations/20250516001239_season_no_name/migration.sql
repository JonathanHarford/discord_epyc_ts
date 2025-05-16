/*
  Warnings:

  - You are about to drop the column `name` on the `Season` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Season_name_key";

-- AlterTable
ALTER TABLE "Season" DROP COLUMN "name";
