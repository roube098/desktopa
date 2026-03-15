"""
OnlyOffice Spreadsheet Agent Backend
Minimal Setup
"""

from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "ok",
        "message": "onlyoffice-spreadsheet-agent is running"
    }), 200

# =============================================================================
# MAIN
# =============================================================================
if __name__ == '__main__':
    # Run the Flask server
    print("Starting API Server on port 3000...")
    app.run(host='0.0.0.0', port=8090, debug=True)
