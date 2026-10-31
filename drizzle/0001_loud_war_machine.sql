CREATE INDEX `records_owner_kind` ON `records` (`owner`,`kind`);
--> statement-breakpoint
CREATE UNIQUE INDEX `records_isbn_unique` ON `records` (json_extract(data, '$.isbn')) WHERE kind = 'Publishing';
