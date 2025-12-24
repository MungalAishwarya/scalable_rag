from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
import os
import uuid
from typing import List
from datetime import datetime

# Import our modules
from models import SessionLocal, PDFDocument, ChatHistory
from rag_service import SimpleRAGService

# Initialize FastAPI app
app = FastAPI(
    title="Advanced RAG App with OCR",
    description="PDF upload with OCR support, automatic indexing, and question answering",
    version="2.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize RAG service
rag_service = SimpleRAGService()

# Dependency to get database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Pydantic models
class QuestionRequest(BaseModel):
    question: str
    document_id: int

class ChatHistoryResponse(BaseModel):
    id: int
    document_id: int
    question: str
    answer: str
    created_at: datetime

    class Config:
        from_attributes = True

class PDFDocumentResponse(BaseModel):
    id: int
    filename: str
    uploaded_at: datetime
    chunks_count: int
    collection_name: str
    extraction_method: str = "direct"

    class Config:
        from_attributes = True

# Routes
@app.get("/")
async def root():
    return {
        "message": "Advanced RAG API with OCR Ready", 
        "status": "OK",
        "features": ["PDF Upload", "OCR Support", "Auto Indexing", "Q&A", "Chat History"]
    }


@app.post("/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload PDF file with progress tracking"""
    try:
        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="Only PDF files are accepted")

        # Create uploads directory
        os.makedirs("uploads", exist_ok=True)
        
        # Generate unique filename
        unique_filename = f"{uuid.uuid4().hex[:8]}_{file.filename}"
        file_path = os.path.join("uploads", unique_filename)

        # Save file
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)

        print(f"📁 File saved, starting processing...")
        
        # Process PDF with RAG service
        result = rag_service.process_pdf(file_path, file.filename)
        
        # Save to database
        db_document = PDFDocument(
            filename=file.filename,
            file_path=file_path,
            collection_name=result["collection_name"],
            chunks_count=result["chunks_count"]
        )
        db.add(db_document)
        db.commit()
        db.refresh(db_document)

        return {
            "message": "PDF successfully uploaded and indexed",
            "document_id": db_document.id,
            "filename": file.filename,
            "chunks_count": result["chunks_count"],
            "collection_name": result["collection_name"],
            "processing_time": result.get("processing_time", 0)
        }

    except Exception as e:
        # Clean up file if processing fails
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
# [Rest of the routes remain the same as before...]
# ask_question, get_documents, get_chat_history, delete_document, clear_chat_history, status

@app.post("/ask")
async def ask_question(
    request: QuestionRequest,
    db: Session = Depends(get_db)
):
    """Ask question about uploaded PDF"""
    try:
        # Get document from database
        document = db.query(PDFDocument).filter(PDFDocument.id == request.document_id).first()
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        # Get answer from RAG service
        answer = rag_service.ask_question(document.collection_name, request.question)
        
        # Save to chat history
        chat_entry = ChatHistory(
            document_id=request.document_id,
            question=request.question,
            answer=answer
        )
        db.add(chat_entry)
        db.commit()
        db.refresh(chat_entry)

        return {
            "answer": answer,
            "document_id": request.document_id,
            "document_name": document.filename
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing question: {str(e)}")

@app.get("/documents", response_model=List[PDFDocumentResponse])
async def get_documents(db: Session = Depends(get_db)):
    """Get list of all uploaded PDF documents"""
    documents = db.query(PDFDocument).order_by(PDFDocument.uploaded_at.desc()).all()
    return documents

@app.get("/history/{document_id}", response_model=List[ChatHistoryResponse])
async def get_chat_history(document_id: int, db: Session = Depends(get_db)):
    """Get chat history for a specific document"""
    history = db.query(ChatHistory).filter(
        ChatHistory.document_id == document_id
    ).order_by(ChatHistory.created_at.asc()).all()
    return history

@app.delete("/document/{document_id}")
async def delete_document(document_id: int, db: Session = Depends(get_db)):
    """Delete a PDF document and its associated data"""
    try:
        # Find document
        document = db.query(PDFDocument).filter(PDFDocument.id == document_id).first()
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        # Delete file from filesystem
        if os.path.exists(document.file_path):
            os.remove(document.file_path)

        # Delete vectors from vector store
        rag_service.delete_document_vectors(document.collection_name)
        
        # Delete chat history from database
        db.query(ChatHistory).filter(ChatHistory.document_id == document_id).delete()
        
        # Delete document from database
        db.delete(document)
        db.commit()

        return {
            "message": "Document and related data successfully deleted",
            "document_id": document_id
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")

@app.delete("/history/{document_id}")
async def clear_chat_history(document_id: int, db: Session = Depends(get_db)):
    """Clear chat history for a specific document"""
    try:
        # Verify document exists
        document = db.query(PDFDocument).filter(PDFDocument.id == document_id).first()
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        # Clear chat history
        db.query(ChatHistory).filter(ChatHistory.document_id == document_id).delete()
        db.commit()
        
        return {
            "message": "Chat history successfully cleared",
            "document_id": document_id
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to clear history: {str(e)}")

@app.get("/status")
async def status():
    """Check service status"""
    return {
        "status": "OK",
        "message": "Advanced RAG service with OCR is running",
        "features": ["OCR Support", "Text Extraction", "Image Processing"]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)