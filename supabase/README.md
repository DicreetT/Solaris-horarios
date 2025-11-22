# Supabase Migrations

This directory contains the database schema migrations for the Solaris Horarios project.

## Structure

- `migrations/`: Contains SQL files with the database schema changes.

## Usage

To apply these migrations to your local or remote Supabase instance, you can use the [Supabase CLI](https://supabase.com/docs/guides/cli).

### 1. Install Supabase CLI

```bash
brew install supabase/tap/supabase
```

### 2. Login

```bash
supabase login
```

### 3. Link Project

```bash
supabase link --project-ref <your-project-id>
```

### 4. Apply Migrations

```bash
supabase db push
```

## Current Schema

The file `migrations/20251122000000_initial_schema.sql` contains the snapshot of the database schema as of November 22, 2025. It includes:

- Tables: `time_entries`, `training_requests`, `todos`, `meeting_requests`, `absence_requests`, `notifications`, `folder_updates`.
- RLS Policies for `anon` and `authenticated` roles.
