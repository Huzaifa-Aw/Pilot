-- AlterTable
ALTER TABLE "OrganizationMember" ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "preferredWorkMode" TEXT;

-- CreateTable
CREATE TABLE "MemberCertification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "issuedOn" DATE,
    "expiresOn" DATE,
    "credentialId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberCertification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberCertification_organizationId_expiresOn_idx" ON "MemberCertification"("organizationId", "expiresOn");

-- CreateIndex
CREATE UNIQUE INDEX "MemberCertification_memberId_name_key" ON "MemberCertification"("memberId", "name");

-- AddForeignKey
ALTER TABLE "MemberCertification" ADD CONSTRAINT "MemberCertification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberCertification" ADD CONSTRAINT "MemberCertification_memberId_organizationId_fkey" FOREIGN KEY ("memberId", "organizationId") REFERENCES "OrganizationMember"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve legacy free-form skills as structured entries with an unspecified,
-- neutral proficiency level.
INSERT INTO "MemberSkill" ("id", "organizationId", "memberId", "name", "level", "createdAt", "updatedAt")
SELECT DISTINCT ON (member."id", lower(trim(skill.value #>> '{}')))
    gen_random_uuid()::TEXT,
    member."organizationId",
    member."id",
    trim(skill.value #>> '{}'),
    3,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "OrganizationMember" member
CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(member."skills") = 'array' THEN member."skills"
      ELSE '[]'::jsonb
    END
) AS skill(value)
WHERE jsonb_typeof(skill.value) = 'string' AND trim(skill.value #>> '{}') <> ''
ORDER BY member."id", lower(trim(skill.value #>> '{}'));
