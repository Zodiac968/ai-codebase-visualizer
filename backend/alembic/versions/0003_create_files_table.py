"""create files table

Revision ID: 0003_create_files_table
Revises: 0002_create_repos_and_jobs
Create Date: 2026-09-10 21:20:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0003_create_files_table'
down_revision: Union[str, None] = '0002_create_repos_and_jobs'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create files table
    op.create_table(
        'files',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('repository_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('file_path', sa.String(length=1024), nullable=False),
        sa.Column('language', sa.String(length=50), nullable=False),
        sa.Column('size_bytes', sa.Integer(), server_default='0', nullable=False),
        sa.Column('line_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('sha256_hash', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['repository_id'], ['repositories.id'], name=op.f('fk_files_repository_id_repositories'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_files')),
        sa.UniqueConstraint('repository_id', 'file_path', name='uq_repository_file_path')
    )
    op.create_index(op.f('ix_files_repository_id'), 'files', ['repository_id'], unique=False)
    op.create_index(op.f('ix_files_language'), 'files', ['language'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_files_language'), table_name='files')
    op.drop_index(op.f('ix_files_repository_id'), table_name='files')
    op.drop_table('files')
