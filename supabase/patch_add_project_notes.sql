do $$
begin
	if not exists (
		select 1
		from information_schema.columns
		where table_schema = 'public'
		  and table_name = 'projects'
		  and column_name = 'project_notes'
	) then
		alter table projects add column project_notes text;
	end if;
end;
$$;

update projects
	set project_notes = project_ai_notes
	where project_notes is null and project_ai_notes is not null;
