import tree_sitter_python
from tree_sitter import Language, Parser

py_lang = Language(tree_sitter_python.language())
parser = Parser(py_lang)

source = b'''import os
from fastapi import FastAPI, APIRouter as Router

app = FastAPI()

class UserService:
    """User service docstring."""
    def __init__(self, db: str):
        self.db = db

    def get_user(self, user_id: str) -> dict:
        """Fetch user by ID."""
        return {"id": user_id}

@app.get("/users/{id}")
def read_user(id: str):
    """Retrieve user."""
    def inner_helper():
        return 42
    return {"id": id}
'''

tree = parser.parse(source)
print("Root node type:", tree.root_node.type)
for child in tree.root_node.children:
    print(" - Child:", child.type, child.start_point, child.end_point)
