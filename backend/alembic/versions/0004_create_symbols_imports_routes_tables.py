"""create symbols, dependencies, and routes tables

Revision ID: 0004_create_symbols_tables
Revises: 0003_create_files_table
Create Date: 2026-09-11 06:20:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0004_create_symbols_tables'
down_revision: Union[str, None] = '0003_create_files_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create symbols table
    op.create_table(
        'symbols',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('file_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('symbol_type', sa.String(length=50), nullable=False),
        sa.Column('qualified_name', sa.String(length=512), nullable=False),
        sa.Column('parent_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('start_line', sa.Integer(), nullable=False),
        sa.Column('end_line', sa.Integer(), nullable=False),
        sa.Column('start_column', sa.Integer(), server_default='0', nullable=False),
        sa.Column('end_column', sa.Integer(), server_default='0', nullable=False),
        sa.Column('signature', sa.String(length=1024), nullable=True),
        sa.Column('docstring', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['file_id'], ['files.id'], name=op.f('fk_symbols_file_id_files'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['parent_id'], ['symbols.id'], name=op.f('fk_symbols_parent_id_symbols'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_symbols'))
    )
    op.create_index(op.f('ix_symbols_file_id'), 'symbols', ['file_id'], unique=False)
    op.create_index(op.f('ix_symbols_symbol_type'), 'symbols', ['symbol_type'], unique=False)
    op.create_index(op.f('ix_symbols_qualified_name'), 'symbols', ['qualified_name'], unique=False)

    # 2. Create dependencies table
    op.create_table(
        'dependencies',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('file_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('module_name', sa.String(length=512), nullable=False),
        sa.Column('imported_name', sa.String(length=255), nullable=True),
        sa.Column('alias', sa.String(length=255), nullable=True),
        sa.Column('import_type', sa.String(length=50), server_default='import', nullable=False),
        sa.Column('line_number', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['file_id'], ['files.id'], name=op.f('fk_dependencies_file_id_files'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_dependencies'))
    )
    op.create_index(op.f('ix_dependencies_file_id'), 'dependencies', ['file_id'], unique=False)
    op.create_index(op.f('ix_dependencies_module_name'), 'dependencies', ['module_name'], unique=False)

    # 3. Create routes table
    op.create_table(
        'routes',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('file_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('symbol_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('framework', sa.String(length=50), nullable=False),
        sa.Column('http_method', sa.String(length=20), nullable=False),
        sa.Column('route_path', sa.String(length=512), nullable=False),
        sa.Column('line_number', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['file_id'], ['files.id'], name=op.f('fk_routes_file_id_files'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['symbol_id'], ['symbols.id'], name=op.f('fk_routes_symbol_id_symbols'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_routes'))
    )
    op.create_index(op.f('ix_routes_file_id'), 'routes', ['file_id'], unique=False)
    op.create_index(op.f('ix_routes_framework'), 'routes', ['framework'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_routes_framework'), table_name='routes')
    op.drop_index(op.f('ix_routes_file_id'), table_name='routes')
    op.drop_table('routes')

    op.drop_index(op.f('ix_dependencies_module_name'), table_name='dependencies')
    op.drop_index(op.f('ix_dependencies_file_id'), table_name='dependencies')
    op.drop_table('dependencies')

    op.drop_index(op.f('ix_symbols_qualified_name'), table_name='symbols')
    op.drop_index(op.f('ix_symbols_symbol_type'), table_name='symbols')
    op.drop_index(op.f('ix_symbols_file_id'), table_name='symbols')
    op.drop_table('symbols')
