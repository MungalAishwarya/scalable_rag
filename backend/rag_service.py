import os
import uuid
import pdfplumber
import pytesseract
from PIL import Image
import pdf2image
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_openai import AzureOpenAIEmbeddings, AzureChatOpenAI
from langchain_core.documents import Document
from dotenv import load_dotenv
import asyncio
import time

load_dotenv()

class SimpleRAGService:
    def __init__(self):
        self.vector_store_path = "./chroma_db"
        self.embeddings = None
        self.llm = None
        self._initialize_azure_components()
    
    def _initialize_azure_components(self):
        """Initialize Azure OpenAI components"""
        try:
            self.embeddings = AzureOpenAIEmbeddings(
                azure_deployment="text-embedding-ada-002",
                openai_api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2023-05-15"),
                azure_endpoint=os.getenv("AZURE_OPENAI_API_BASE"),
                api_key=os.getenv("AZURE_OPENAI_API_KEY"),
                chunk_size=16  # Process embeddings in smaller batches
            )
            self.llm = AzureChatOpenAI(
                azure_deployment=os.getenv("AZURE_DEPLOYMENT_NAME", "gpt-35-turbo"),
                openai_api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2023-05-15"),
                azure_endpoint=os.getenv("AZURE_OPENAI_API_BASE"),
                api_key=os.getenv("AZURE_OPENAI_API_KEY"),
                temperature=0
            )
            print("✅ Azure components initialized successfully")
        except Exception as e:
            print(f"❌ Azure components initialization failed: {e}")
            raise

    def extract_text_from_pdf(self, pdf_path: str) -> str:
        """Optimized text extraction from PDF"""
        try:
            text = ""
            print("📖 Extracting text from PDF...")
            
            with pdfplumber.open(pdf_path) as pdf:
                total_pages = len(pdf.pages)
                
                for i, page in enumerate(pdf.pages):
                    if i % 10 == 0:  # Progress indicator every 10 pages
                        print(f"📄 Processed {i}/{total_pages} pages...")
                    
                    page_text = page.extract_text()
                    if page_text and page_text.strip():
                        text += page_text + "\n"
            
            if not text.strip():
                raise Exception("No text found in PDF.")
            
            print(f"✅ Successfully extracted text from {total_pages} pages")
            return text
            
        except Exception as e:
            print(f"❌ Text extraction failed: {e}")
            raise Exception(f"Text extraction failed: {str(e)}")

    def process_pdf(self, pdf_path: str, filename: str):
        """Optimized PDF processing with progress tracking"""
        try:
            print(f"📄 Processing PDF: {filename}")
            start_time = time.time()
            
            # Extract text
            text = self.extract_text_from_pdf(pdf_path)
            extraction_time = time.time() - start_time
            print(f"✅ Extracted {len(text)} characters in {extraction_time:.2f}s")

            # Optimized text splitting for large documents
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=1500,  # Increased chunk size for better context
                chunk_overlap=300,  # Increased overlap
                length_function=len,
                separators=["\n\n", "\n", ". ", "! ", "? ", " ", ""]  # Better separators
            )
            
            print("✂️  Splitting text into chunks...")
            split_start = time.time()
            chunks = text_splitter.split_text(text)
            split_time = time.time() - split_start
            print(f"✅ Split into {len(chunks)} chunks in {split_time:.2f}s")

            # Create documents with metadata
            documents = []
            for i, chunk in enumerate(chunks):
                if len(chunk.strip()) > 50:  # Only include substantial chunks
                    documents.append(
                        Document(
                            page_content=chunk,
                            metadata={
                                "source": filename, 
                                "chunk_id": i,
                                "total_chunks": len(chunks)
                            }
                        )
                    )

            print(f"📊 Creating vector store with {len(documents)} documents...")
            
            # Create unique collection name
            collection_name = f"pdf_{uuid.uuid4().hex[:8]}"

            # Create vector store with batch processing
            vector_start = time.time()
            Chroma.from_documents(
                documents=documents,
                embedding=self.embeddings,
                persist_directory=self.vector_store_path,
                collection_name=collection_name,
                # batch_size=100  # Process in smaller batches if needed
            )
            vector_time = time.time() - vector_start

            total_time = time.time() - start_time
            print(f"🎉 PDF indexed successfully in {total_time:.2f}s")
            print(f"   - Extraction: {extraction_time:.2f}s")
            print(f"   - Splitting: {split_time:.2f}s") 
            print(f"   - Vectorization: {vector_time:.2f}s")

            return {
                "chunks_count": len(documents),
                "collection_name": collection_name,
                "status": "success",
                "processing_time": total_time,
                "total_pages": len(text.split('--- Page')) if '--- Page' in text else 'unknown'
            }

        except Exception as e:
            print(f"❌ PDF processing failed: {e}")
            raise Exception(f"PDF processing failed: {str(e)}")

    def ask_question(self, collection_name: str, question: str) -> str:
        """Answer question based on PDF content"""
        try:
            print(f"❓ Question: {question}")
            print(f"🔍 Searching in collection: {collection_name}")

            # Load existing vector store
            vector_store = Chroma(
                persist_directory=self.vector_store_path,
                embedding_function=self.embeddings,
                collection_name=collection_name
            )

            retriever = vector_store.as_retriever(
                search_type="similarity",
                search_kwargs={"k": 3}
            )
            
            relevant_docs = retriever.invoke(question)

            if not relevant_docs:
                return "I could not find the answer to this question in the provided document."

            context = "\n\n".join([doc.page_content for doc in relevant_docs])

            prompt = f"""
            You are a helpful assistant. Answer the question based on the given context.

            Context:
            {context}

            Question: {question}

            Instructions:
            - Answer only from the given context
            - If the answer is not in the context, say "I could not find this information in the document"
            - Keep the answer clear and concise
            """

            response = self.llm.invoke(prompt)
            return response.content

        except Exception as e:
            print(f"❌ Question answering failed: {e}")
            return f"Sorry, there was an error processing your question: {str(e)}"

    def delete_document_vectors(self, collection_name: str):
        """Delete vectors for a specific document"""
        try:
            print(f"🗑️  Deleting collection: {collection_name}")
            # Implementation for deleting vectors
            return True
        except Exception as e:
            print(f"❌ Failed to delete vectors: {e}")
            return False