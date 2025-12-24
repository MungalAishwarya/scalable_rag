import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  Box,
  Drawer,
  Button,
  Typography,
  List,
  ListItem,
  ListItemText,
  IconButton,
  AppBar,
  Toolbar,
  TextField,
  Paper,
  Chip,
  Avatar,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Fab,
} from "@mui/material";
import {
  Upload as UploadIcon,
  Send as SendIcon,
  Add as AddIcon,
  Menu as MenuIcon,
  Delete as DeleteIcon,
  Chat as ChatIcon,
  History as HistoryIcon,
} from "@mui/icons-material";

const API_BASE = "http://localhost:8000";

function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, documentId: null, type: "" });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef(null);

  useEffect(() => { loadDocuments(); }, []);
  useEffect(() => {
    if (selectedDocument) loadChatHistory(selectedDocument.id);
    else setChatHistory([]);
  }, [selectedDocument]);
  useEffect(() => { scrollToBottom(); }, [chatHistory, asking]);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  const loadDocuments = async () => {
    try {
      const response = await axios.get(`${API_BASE}/documents`);
      setDocuments(response.data);
    } catch {
      showMessage("error", "Error loading documents");
    }
  };

  const loadChatHistory = async (id) => {
    try {
      const response = await axios.get(`${API_BASE}/history/${id}`);
      setChatHistory(response.data);
    } catch (err) { console.error(err); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf"))
      return showMessage("error", "Please select only PDF files");
    if (file.size > 10 * 1024 * 1024)
      return showMessage("error", "File size should be less than 10MB");

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await axios.post(`${API_BASE}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
      });
      showMessage("success", "✅ PDF uploaded successfully!");
      await loadDocuments();
      const newDoc = res.data;
      setSelectedDocument({
        id: newDoc.document_id,
        filename: newDoc.filename,
        chunks_count: newDoc.chunks_count,
      });
    } catch (err) {
      showMessage("error", `❌ Upload failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const askQuestion = async () => {
    if (!question.trim()) return showMessage("error", "Please type a question");
    if (!selectedDocument) return showMessage("error", "Please select a document first");
    setAsking(true);
    try {
      const res = await axios.post(`${API_BASE}/ask`, {
        question,
        document_id: selectedDocument.id,
      });
      const newChat = {
        id: Date.now(),
        question,
        answer: res.data.answer,
        created_at: new Date().toISOString(),
      };
      setChatHistory((prev) => [...prev, newChat]);
      setQuestion("");
      await loadChatHistory(selectedDocument.id);
    } catch (err) {
      showMessage("error", `❌ Error: ${err.response?.data?.detail || err.message}`);
    } finally {
      setAsking(false);
    }
  };

  const deleteDocument = async (id) => {
    try {
      await axios.delete(`${API_BASE}/document/${id}`);
      showMessage("success", "✅ Document deleted");
      if (selectedDocument?.id === id) {
        setSelectedDocument(null);
        setChatHistory([]);
      }
      await loadDocuments();
    } catch (err) {
      showMessage("error", `❌ Delete failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setDeleteDialog({ open: false, documentId: null, type: "" });
    }
  };

  const clearChatHistory = async (id) => {
    try {
      await axios.delete(`${API_BASE}/history/${id}`);
      setChatHistory([]);
      showMessage("success", "✅ Chat cleared");
    } catch (err) {
      showMessage("error", `❌ Error: ${err.response?.data?.detail || err.message}`);
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: "", text: "" }), 4000);
  };

  const formatDate = (d) =>
    new Date(d).toLocaleString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Box sx={{ display: "flex", height: "100vh", bgcolor: "#343541", color: "white" }}>
      {/* Sidebar */}
      <Drawer
        variant="persistent"
        open={sidebarOpen}
        sx={{
          width: sidebarOpen ? 280 : 0,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: 280,
            bgcolor: "#202123",
            border: "none",
            color: "white",
          },
        }}
      >
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setSelectedDocument(null)}
          sx={{
            m: 2,
            color: "white",
            borderColor: "rgba(255,255,255,0.2)",
            "&:hover": { borderColor: "#19C37D", backgroundColor: "rgba(25,195,125,0.1)" },
          }}
          fullWidth
        >
          New Chat
        </Button>

        <Box sx={{ p: 1, flex: 1, overflowY: "auto" }}>
          <Typography variant="subtitle2" sx={{ px: 2, py: 1, color: "rgba(255,255,255,0.6)" }}>
            YOUR DOCUMENTS
          </Typography>
          {documents.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <ChatIcon sx={{ fontSize: 40, color: "rgba(255,255,255,0.3)" }} />
              <Typography variant="body2" color="rgba(255,255,255,0.5)">
                No documents uploaded
              </Typography>
            </Box>
          ) : (
            <List sx={{ p: 0 }}>
              {documents.map((doc) => (
                <ListItem
                  key={doc.id}
                  button
                  selected={selectedDocument?.id === doc.id}
                  onClick={() => setSelectedDocument(doc)}
                  sx={{
                    mx: 1,
                    mb: 0.5,
                    borderRadius: 1,
                    "&.Mui-selected": {
                      bgcolor: "rgba(255,255,255,0.1)",
                    },
                    "&:hover": { bgcolor: "rgba(63, 22, 212, 0.08)" },
                    "&:hover": { backgroundColor: "rgba(25,195,125,0.1)" },
                  }}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => setDeleteDialog({ open: true, documentId: doc.id, type: "document", filename: doc.filename })}
                      sx={{ color: "rgba(255,255,255,0.5)" }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={<Typography variant="body2">{doc.filename}</Typography>}
                    secondary={<Typography variant="caption" color="rgba(255,255,255,0.5)">{formatDate(doc.uploaded_at)}</Typography>}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Box>

        {/* Clear Chat Option */}
        {selectedDocument && (
          <Button
            startIcon={<HistoryIcon />}
            onClick={() => clearChatHistory(selectedDocument.id)}
            sx={{
              m: 2,
              color: "#19C37D",
              borderColor: "#19C37D",
              "&:hover": { backgroundColor: "rgba(25,195,125,0.1)" },
            }}
            variant="outlined"
            fullWidth
          >
            Clear Conversation
          </Button>
        )}
      </Drawer>

      {/* Main Section */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <AppBar
          position="static"
          elevation={0}
          sx={{ bgcolor: "#202123", borderBottom: "1px solid #2A2B32", color: "white" }}
        >
          <Toolbar variant="dense">
            <IconButton edge="start" onClick={() => setSidebarOpen(!sidebarOpen)} sx={{ color: "white", mr: 2 }}>
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              {selectedDocument ? selectedDocument.filename : "Smart PDF Assistant"}
            </Typography>
            {selectedDocument && (
              <Chip label={`${selectedDocument.chunks_count} chunks`} size="small" sx={{ borderColor: "#19C37D", color: "#19C37D" }} variant="outlined" />
            )}
            {selectedDocument && (
          <Button
            startIcon={<HistoryIcon />}
            onClick={() => clearChatHistory(selectedDocument.id)}
            sx={{
              m: 2,
              color: "#19C37D",
              borderColor: "#19C37D",
              "&:hover": { backgroundColor: "rgba(25,195,125,0.1)" },
            }}
            
          >
          </Button>
        )}
          </Toolbar>
        </AppBar>

        {/* Chat Area */}
        <Box sx={{ flex: 1, overflowY: "auto", p: 3, bgcolor: "#343541" }}>
          {message.text && (
            <Alert severity={message.type} sx={{ position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 1000 }}>
              {message.text}
            </Alert>
          )}

          {!selectedDocument ? (
            <Box sx={{ textAlign: "center", mt: 10 }}>
             
              <Typography variant="h4" fontWeight="bold">Scalable RAG Application</Typography>
              <Typography variant="h6" sx={{ color: "rgba(255,255,255,0.7)", mb: 2 }}>
                Upload a PDF and start chatting with it.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ maxWidth: 800, mx: "auto", width: "100%" }}>
              {chatHistory.map((chat) => (
                <Box key={chat.id} sx={{ mb: 4 }}>
                  <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
                    <Paper sx={{ p: 2, bgcolor: "#19C37D", color: "white", borderRadius: 2, borderBottomRightRadius: 0 }}>
                      {chat.question}
                    </Paper>
                  </Box>
                  <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
                    <Paper sx={{ p: 2, bgcolor: "#444654", color: "white", borderRadius: 2, borderBottomLeftRadius: 0 }}>
                      <Typography sx={{ whiteSpace: "pre-wrap" }}>{chat.answer}</Typography>
                      <Typography variant="caption" sx={{ display: "block", mt: 1, color: "rgba(255,255,255,0.5)" }}>
                        {formatDate(chat.created_at)}
                      </Typography>
                    </Paper>
                  </Box>
                </Box>
              ))}
              {asking && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 2 }}>
                  <CircularProgress size={20} sx={{ color: "#19C37D" }} />
                  <Typography variant="body2" color="rgba(255,255,255,0.7)">Thinking...</Typography>
                </Box>
              )}
              <div ref={messagesEndRef} />
            </Box>
          )}
        </Box>

        {/* Input Area */}
<Box sx={{ p: 2, borderTop: "1px solid #2A2B32", bgcolor: "#202123" }}>
  <Box sx={{ maxWidth: 800, mx: "auto", display: "flex", gap: 1, alignItems: "center" }}>
    <TextField
      fullWidth
      multiline
      maxRows={4}
      value={question}
      onChange={(e) => setQuestion(e.target.value)}
      onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && askQuestion()}
      placeholder={
        selectedDocument
          ? `Ask about ${selectedDocument.filename}...`
          : "Upload a PDF to start chatting..."
      }
      disabled={asking}
      sx={{
        "& .MuiOutlinedInput-root": {
          display: "flex",
          alignItems: "center",
          borderRadius: 2,
          bgcolor: "#40414F",
          color: "white",
          paddingRight: "50px",
          "& fieldset": { borderColor: "#565869" },
          "&:hover fieldset": { borderColor: "#19C37D" },
          "&.Mui-focused fieldset": { borderColor: "#19C37D" },
        },
        "& .MuiInputBase-input": {
          pl: 5, // to make room for "+" icon inside
        },
        position: "relative",
      }}
      InputProps={{
        startAdornment: !selectedDocument && (
          <>
            <input
              accept=".pdf"
              style={{ display: "none" }}
              id="pdf-upload-inside"
              type="file"
              onChange={handleFileUpload}
              disabled={uploading}
            />
            <label htmlFor="pdf-upload-inside" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>
              <IconButton
                component="span"
                size="small"
                sx={{
                  bgcolor: "#19C37D",
                  color: "white",
                  "&:hover": { bgcolor: "#15a46e" },
                  width: 32,
                  height: 32,
                }}
              >
                <AddIcon fontSize="small" />
              </IconButton>
            </label>
          </>
        ),
      }}
    />

    {selectedDocument && (
      <IconButton
        onClick={askQuestion}
        disabled={!question.trim() || asking}
        sx={{
          bgcolor: question.trim() ? "#19C37D" : "grey.700",
          color: "white",
          "&:hover": { bgcolor: "#15a46e" },
          width: 50,
          height: 50,
        }}
      >
        {asking ? <CircularProgress size={20} sx={{ color: "white" }} /> : <SendIcon />}
      </IconButton>
    )}
  </Box>
</Box>

      </Box>

      {/* Delete Confirmation */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, documentId: null, type: "" })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Document</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to delete "{deleteDialog.filename}"?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, documentId: null, type: "" })}>Cancel</Button>
          <Button onClick={() => deleteDocument(deleteDialog.documentId)} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default App;
