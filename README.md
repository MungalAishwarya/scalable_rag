# scalable_rag

here upload the any pdf document and ask question ans




# backend.py
import os
import datetime
from dotenv import load_dotenv  


from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List

import weaviate
from weaviate.auth import AuthApiKey
from weaviate.classes.config import Configure, Property, DataType

from openai import AzureOpenAI

load_dotenv()

# ------------------------------
# ENV Variables
# ------------------------------
WEAVIATE_URL = os.getenv("WEAVIATE_URL")
WEAVIATE_API_KEY = os.getenv("WEAVIATE_API_KEY")
AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY")
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
AZURE_DEPLOYMENT_NAME = os.getenv("AZURE_DEPLOYMENT_NAME")

# ------------------------------
# Connect to Weaviate
# ------------------------------
client = weaviate.connect_to_weaviate_cloud(
    cluster_url=WEAVIATE_URL,
    auth_credentials=AuthApiKey(WEAVIATE_API_KEY)
)

# ------------------------------
# Connect to Azure OpenAI
# ------------------------------
azure_client = AzureOpenAI(
    api_key=AZURE_OPENAI_API_KEY,
    azure_endpoint=AZURE_OPENAI_ENDPOINT,
    api_version="2024-05-01-preview"
)

# ------------------------------
# FastAPI app
# ------------------------------
app = FastAPI(title="Memory Chatbot API")

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # Allow all frontend origins
    allow_methods=["*"],        # Allow GET, POST, DELETE, OPTIONS
    allow_headers=["*"],        # Allow all headers
)
# ------------------------------
# Request / Response Models
# ------------------------------
class MessageRequest(BaseModel):
    message: str


class ConversationItem(BaseModel):
    question: str
    answer: str
    timestamp: str


# ------------------------------
# Schema setup
# ------------------------------
def setup_schema():
    try:
        collections = client.collections.list_all()

        if "Conversation" not in collections:
            client.collections.create(
                name="Conversation",
                properties=[
                    Property(name="question", data_type=DataType.TEXT),
                    Property(name="answer", data_type=DataType.TEXT),
                    Property(name="timestamp", data_type=DataType.TEXT)
                ],
                vectorizer_config=Configure.Vectorizer.none()
            )
            print("✅ Created Conversation collection!")
        else:
            print("ℹ️ Conversation collection already exists.")
    except Exception as e:
        print("Schema Error:", e)


setup_schema()


# ------------------------------
# Helper functions
# ------------------------------
def save_conversation(question: str, answer: str):
    try:
        col = client.collections.get("Conversation")
        col.data.insert({
            "question": question,
            "answer": answer,
            "timestamp": datetime.datetime.now().isoformat()
        })
    except Exception as e:
        print("Save Error:", e)


def get_conversation_history() -> List[ConversationItem]:
    try:
        col = client.collections.get("Conversation")
        result = col.query.fetch_objects(limit=100)
        items = [ConversationItem(**obj.properties) for obj in result.objects]
        return sorted(items, key=lambda x: x.timestamp, reverse=True)
    except Exception as e:
        print("Fetch Error:", e)
        return []


def get_ai_response(user_input: str) -> str:
    history = get_conversation_history()

    history_text = ""
    for h in history[:5]:
        history_text += f"Q: {h.question}\nA: {h.answer}\n\n"

    system_content = (
        "You are a helpful assistant with memory.\n"
        "Use the following recent conversation history:\n\n"
        f"{history_text}"
    )

    reply = azure_client.chat.completions.create(
        model=AZURE_DEPLOYMENT_NAME,
        messages=[
            {"role": "system", "content": system_content},
            {"role": "user", "content": user_input}
        ],
        max_tokens=400,
        temperature=0.7
    )

    return reply.choices[0].message.content


# ------------------------------
# API Endpoints
# ------------------------------
@app.post("/chat", response_model=ConversationItem)
def chat(req: MessageRequest):
    user_input = req.message.strip()
    if not user_input:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    answer = get_ai_response(user_input)
    save_conversation(user_input, answer)

    return ConversationItem(
        question=user_input,
        answer=answer,
        timestamp=datetime.datetime.now().isoformat()
    )


@app.get("/history", response_model=List[ConversationItem])
def history():
    return get_conversation_history()


@app.delete("/history")
def clear_history():
    try:
        client.collections.delete("Conversation")
        setup_schema()
        return {"detail": "All conversation history cleared."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error clearing history: {e}")










