import tree_sitter_python
from tree_sitter import Language, Parser, Node
import re

PY_LANG = Language(tree_sitter_python.language())
parser = Parser(PY_LANG)

code = b'''
import os
import requests as req
from fastapi import FastAPI, APIRouter, Depends as D
from flask import Flask

app = FastAPI()
router = APIRouter(prefix="/v1")
flask_app = Flask(__name__)

class BaseService:
    """Base docstring."""
    pass

class UserService(BaseService):
    """Service handling users."""
    def __init__(self, db: str):
        self.db = db

    def get_user(self, user_id: str) -> dict:
        """Fetch user by id."""
        return {"id": user_id}

@app.get("/users/{id}")
@router.post("/users", status_code=201)
def create_user_route(payload: dict) -> dict:
    """Route handler for users."""
    def helper_func():
        return True
    return payload

@flask_app.route("/items", methods=["GET", "POST"])
def flask_items():
    return "items"
'''

tree = parser.parse(code)

def print_tree(node: Node, depth=0):
    indent = "  " * depth
    text_preview = node.text.decode("utf-8", errors="replace")[:30].replace("\n", " ")
    print(f"{indent}{node.type} [{node.start_point.row+1}:{node.start_point.column} -> {node.end_point.row+1}:{node.end_point.column}]: {text_preview}")
    for child in node.children:
        print_tree(child, depth + 1)

print("--- TREE OUTPUT ---")
print_tree(tree.root_node)
