create table if not exists study_runs (
  id text primary key,
  bar_time bigint not null,
  spot double precision not null,
  advice text not null,
  learned text not null,
  created_at timestamptz not null default now()
);

create index if not exists study_runs_created_idx on study_runs (created_at desc);

create table if not exists study_scores (
  run_id text not null,
  play_id text not null,
  trader text not null,
  name text not null,
  kind text not null,
  trades int not null,
  wins int not null,
  expectancy double precision not null,
  habit text not null,
  now_side text not null,
  lesson text not null,
  projection text not null,
  primary key (run_id, play_id)
);
