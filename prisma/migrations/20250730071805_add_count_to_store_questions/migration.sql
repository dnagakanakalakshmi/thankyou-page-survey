-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StoreQuestions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "questions" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_StoreQuestions" ("createdAt", "id", "questions", "shop", "updatedAt") SELECT "createdAt", "id", "questions", "shop", "updatedAt" FROM "StoreQuestions";
DROP TABLE "StoreQuestions";
ALTER TABLE "new_StoreQuestions" RENAME TO "StoreQuestions";
CREATE UNIQUE INDEX "StoreQuestions_shop_key" ON "StoreQuestions"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
