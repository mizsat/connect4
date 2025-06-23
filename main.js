// Connect4 Game Logic using Bitboards
const ROWS = 6;
const COLS = 7;
const H = ROWS + 1; // Bitboard height

class Board {
    constructor(other) {
        if (other) {
            this.player1_board = other.player1_board;
            this.player2_board = other.player2_board;
            this.column_heights = [...other.column_heights];
            this.currentPlayer = other.currentPlayer;
            this.moveCount = other.moveCount;
        } else {
            this.player1_board = 0n;
            this.player2_board = 0n;
            this.column_heights = Array(COLS).fill(0);
            this.currentPlayer = 1;
            this.moveCount = 0;
        }
    }

    makeMove(col) {
        if (this.column_heights[col] >= ROWS) {
            return false; // Column is full
        }
        const row = this.column_heights[col];
        const pos = BigInt(row + col * H);
        const mask = 1n << pos;

        if (this.currentPlayer === 1) {
            this.player1_board |= mask;
        } else {
            this.player2_board |= mask;
        }

        this.column_heights[col]++;
        this.moveCount++;
        this.currentPlayer = 3 - this.currentPlayer;
        return true;
    }

    checkWin() {
        const board = this.currentPlayer === 1 ? this.player2_board : this.player1_board;
        const V_SHIFT = 1n;
        const H_SHIFT = BigInt(H);
        const D1_SHIFT = H_SHIFT - 1n; // Diagonal /
        const D2_SHIFT = H_SHIFT + 1n; // Diagonal \

        const directions = [V_SHIFT, H_SHIFT, D1_SHIFT, D2_SHIFT];
        for (const shift of directions) {
            const y = board & (board >> shift);
            if ((y & (y >> (shift * 2n))) !== 0n) {
                return true;
            }
        }
        return false;
    }

    isDraw() {
        return this.moveCount === ROWS * COLS;
    }
}

// --- MCTS Implementation ---
class Node {
    constructor(board, parent = null) {
        this.board = board;
        this.parent = parent;
        this.children = [];
        this.wins = 0;
        this.visits = 0;
        // A node is terminal if the move that led to it was a winning move.
        // checkWin() checks for the player who just moved.
        this.isTerminalWin = this.board.checkWin();
        this.isTerminalDraw = this.board.isDraw();
        this.untriedMoves = this.isTerminalWin || this.isTerminalDraw ? [] : this.getLegalMoves();
    }

    getLegalMoves() {
        const legalMoves = [];
        for (let col = 0; col < COLS; col++) {
            if (this.board.column_heights[col] < ROWS) {
                legalMoves.push(col);
            }
        }
        return legalMoves;
    }

    ucb1() {
        if (this.visits === 0) return Infinity;
        return (this.wins / this.visits) + Math.sqrt(2 * Math.log(this.parent.visits) / this.visits);
    }

    selectChild() {
        let selected = this.children[0];
        let bestScore = -1;
        for (const child of this.children) {
            const score = child.ucb1();
            if (score > bestScore) {
                bestScore = score;
                selected = child;
            }
        }
        return selected;
    }

    expand() {
        const move = this.untriedMoves.pop();
        const newBoard = new Board(this.board);
        newBoard.makeMove(move);
        const childNode = new Node(newBoard, this);
        this.children.push(childNode);
        return childNode;
    }

    simulate() {
        const tempBoard = new Board(this.board);
        while (true) {
            if (tempBoard.checkWin()) {
                return 3 - tempBoard.currentPlayer; // Winner is the player who just moved
            }
            if (tempBoard.isDraw()) {
                return 0; // Draw
            }
            const legalMoves = [];
            for (let col = 0; col < COLS; col++) {
                if (tempBoard.column_heights[col] < ROWS) {
                    legalMoves.push(col);
                }
            }
            const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
            tempBoard.makeMove(randomMove);
        }
    }

    backpropagate(winner) {
        let temp = this;
        while (temp !== null) {
            temp.visits += 1;
            if (temp.parent && temp.parent.board.currentPlayer === winner) {
                temp.wins += 1;
            }
            temp = temp.parent;
        }
    }
}

// The mcts function is now designed to be incremental.
// It takes an existing rootNode and performs more iterations on it.
async function mcts(rootNode, iterations) {
    if (rootNode.getLegalMoves().length === 0) return;

    for (let i = 0; i < iterations; i++) {
        let node = rootNode;
        // 1. Selection - find a leaf node
        while (node.untriedMoves.length === 0 && node.children.length > 0) {
            node = node.selectChild();
        }

        // 2. Expansion - if the leaf is not terminal, expand it
        if (!node.isTerminalWin && !node.isTerminalDraw) {
            if (node.untriedMoves.length > 0) {
                node = node.expand(); // node is now a new child node
            }
        }

        // 3. Simulation - from the new node (or the terminal leaf)
        let winner;
        if (node.isTerminalWin) {
            winner = 3 - node.board.currentPlayer;
        } else if (node.isTerminalDraw) {
            winner = 0; // Draw
        } else {
            winner = node.simulate();
        }

        // 4. Backpropagation
        node.backpropagate(winner);
    }
}

// --- Global State ---
let history = [new Board()];
let redoStack = [];
let gameOver = false;

// --- UI Elements ---
const boardDiv = document.getElementById('game-board');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const resetBtn = document.getElementById('reset-btn');

// --- Game Logic ---
async function updateUI() {
    const currentBoard = history[history.length - 1];
    renderBoard(currentBoard);
    updateBoardTurnClass(currentBoard); // Add this to set the turn class
    undoBtn.disabled = history.length === 1;
    redoBtn.disabled = redoStack.length === 0;
    await updateWinRates();
}

function initGame() {
    history = [new Board()];
    redoStack = [];
    gameOver = false;
    updateUI();
}

// This function adds a class to the board container based on the current player.
function updateBoardTurnClass(board) {
    boardDiv.classList.remove('turn-player1', 'turn-player2');
    if (!gameOver) {
        if (board.currentPlayer === 1) {
            boardDiv.classList.add('turn-player1');
        } else {
            boardDiv.classList.add('turn-player2');
        }
    }
}

function renderBoard(board) {
    boardDiv.innerHTML = '';
    // Iterate through visual rows from top (0) to bottom (ROWS - 1)
    for (let visualRow = 0; visualRow < ROWS; visualRow++) {
        for (let col = 0; col < COLS; col++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.col = col;

            // Map visual row to bitboard row.
            const bitboardRow = (ROWS - 1) - visualRow;

            const pos = BigInt(bitboardRow + col * H);
            const mask = 1n << pos;
            const isPlayer1 = (board.player1_board & mask) !== 0n;
            const isPlayer2 = (board.player2_board & mask) !== 0n;

            if (isPlayer1) {
                cell.classList.add('player1');
            } else if (isPlayer2) {
                cell.classList.add('player2');
            } else {
                // An empty cell is playable if it's the lowest one in the column.
                if (!gameOver && board.column_heights[col] === bitboardRow) {
                    cell.classList.add('playable');
                    // Only add the event listener to playable cells
                    cell.addEventListener('click', handleColumnClick);

                    const winRateOverlay = document.createElement('div');
                    winRateOverlay.className = 'win-rate-overlay';
                    winRateOverlay.id = `win-rate-overlay-${col}`;
                    cell.appendChild(winRateOverlay);
                }
            }
            
            boardDiv.appendChild(cell);
        }
    }
}

/* function updateMessage(board) {
    if (gameOver) {
        const winner = board.currentPlayer === 1 ? 'White' : 'Black';
        messageDiv.textContent = `${winner} wins!`;
    } else if (board.isDraw()) {
        messageDiv.textContent = 'Draw!';
    } else {
        const color = board.currentPlayer === 1 ? 'Black' : 'White';
        messageDiv.textContent = `${color}'s turn`;
    }
} */

function displayWinRates(rootNode) {
    if (!rootNode) return;
    for (const child of rootNode.children) {
        let move = -1;
        for (let c = 0; c < COLS; c++) {
            if (child.board.column_heights[c] !== rootNode.board.column_heights[c]) {
                move = c;
                break;
            }
        }

        if (move !== -1) {
            const winRateOverlay = document.getElementById(`win-rate-overlay-${move}`);
            if (winRateOverlay) {
                const winRate = child.visits > 0 ? child.wins / child.visits : 0;
                winRateOverlay.textContent = `${(winRate * 100).toFixed(1)}%`;
            }
        }
    }
}

async function updateWinRates() {
    const currentBoard = history[history.length - 1];
    const legalMoves = new Node(currentBoard).getLegalMoves();

    // Clear previous win rates and set placeholder text
    document.querySelectorAll('.win-rate-overlay').forEach(overlay => overlay.textContent = '');
    if (gameOver) return;
    
    if (legalMoves.length > 0) {
        for (const col of legalMoves) {
            const winRateOverlay = document.getElementById(`win-rate-overlay-${col}`);
            if (winRateOverlay) {
                winRateOverlay.textContent = '...';
            }
        }
    } else {
        return; // No legal moves, nothing to calculate
    }

    // Allow UI to update with '...'
    await new Promise(resolve => setTimeout(resolve, 20));

    const TOTAL_SIMULATIONS = 100_000_000;
    const BATCH_SIZE = 10_000; // Update every 10,000 simulations
    const rootNode = new Node(new Board(currentBoard));

    for (let i = 0; i < TOTAL_SIMULATIONS / BATCH_SIZE; i++) {
        // If the game state has changed (e.g., user made a move while we are thinking), stop calculating.
        if (currentBoard !== history[history.length - 1]) {
            return;
        }
        
        await mcts(rootNode, BATCH_SIZE);
        displayWinRates(rootNode);
        
        // Yield to the event loop to allow UI to update and stay responsive
        await new Promise(resolve => setTimeout(resolve, 20));
    }
}

function handleColumnClick(e) {
    if (gameOver) return;
    const col = parseInt(e.currentTarget.dataset.col);
    const currentBoard = history[history.length - 1];
    const newBoard = new Board(currentBoard);

    if (newBoard.makeMove(col)) {
        history.push(newBoard);
        redoStack = []; // Clear redo stack on new move
        if (newBoard.checkWin()) {
            gameOver = true;
        }
        updateUI();
    }
}

function undo() {
    if (history.length > 1) {
        redoStack.push(history.pop());
        gameOver = false; // Game is no longer over if we undo
        updateUI();
    }
}

function redo() {
    if (redoStack.length > 0) {
        history.push(redoStack.pop());
        const currentBoard = history[history.length - 1];
        gameOver = currentBoard.checkWin() || currentBoard.isDraw();
        updateUI();
    }
}

// --- Event Listeners ---
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);
resetBtn.addEventListener('click', initGame);

// --- Initialisation ---
initGame();
