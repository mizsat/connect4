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

async function mcts(board, iterations) {
    const root = new Node(board);
    if (root.getLegalMoves().length === 0) return root;

    for (let i = 0; i < iterations; i++) {
        let node = root;

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
            // The winner is the player who moved to reach this state.
            // The board's currentPlayer has already been flipped.
            winner = 3 - node.board.currentPlayer;
        } else if (node.isTerminalDraw) {
            winner = 0; // Draw
        } else {
            // If we are here, the node is not terminal, so we simulate.
            winner = node.simulate();
        }

        // 4. Backpropagation
        node.backpropagate(winner);
    }
    return root;
}

// --- Global State ---
let history = [new Board()];
let redoStack = [];
let gameOver = false;

// --- UI Elements ---
const columnSelectorsDiv = document.getElementById('column-selectors');
const boardDiv = document.getElementById('game-board');
const messageDiv = document.getElementById('message');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const resetBtn = document.getElementById('reset-btn');

// --- Game Logic ---
async function updateUI() {
    const currentBoard = history[history.length - 1];
    renderBoard(currentBoard);
    updateMessage(currentBoard);
    undoBtn.disabled = history.length === 1 || gameOver;
    redoBtn.disabled = redoStack.length === 0 || gameOver;
    await updateWinRates();
}

function initGame() {
    history = [new Board()];
    redoStack = [];
    gameOver = false;
    createColumnSelectors();
    updateUI();
}

function createColumnSelectors() {
    columnSelectorsDiv.innerHTML = '';
    for (let col = 0; col < COLS; col++) {
        const selector = document.createElement('div');
        selector.className = 'column-selector';
        selector.dataset.col = col;

        const number = document.createElement('span');
        number.textContent = col;

        const winRate = document.createElement('span');
        winRate.className = 'win-rate';
        winRate.id = `win-rate-${col}`;

        selector.appendChild(number);
        selector.appendChild(winRate);

        selector.addEventListener('click', handleColumnClick);
        columnSelectorsDiv.appendChild(selector);
    }
}

function renderBoard(board) {
    boardDiv.innerHTML = '';
    // Iterate through visual rows from top (0) to bottom (ROWS - 1)
    for (let visualRow = 0; visualRow < ROWS; visualRow++) {
        for (let col = 0; col < COLS; col++) {
            const cell = document.createElement('div');
            cell.className = 'cell';

            // Map visual row to bitboard row.
            // Visual top (0) corresponds to bitboard top (ROWS - 1).
            // Visual bottom (ROWS - 1) corresponds to bitboard bottom (0).
            const bitboardRow = (ROWS - 1) - visualRow;

            const pos = BigInt(bitboardRow + col * H);
            const mask = 1n << pos;
            if ((board.player1_board & mask) !== 0n) cell.classList.add('player1');
            if ((board.player2_board & mask) !== 0n) cell.classList.add('player2');
            boardDiv.appendChild(cell);
        }
    }
}

function updateMessage(board) {
    if (gameOver) {
        const winner = board.currentPlayer === 1 ? 'White' : 'Black';
        messageDiv.textContent = `${winner} wins!`;
    } else if (board.isDraw()) {
        messageDiv.textContent = 'Draw!';
    } else {
        const color = board.currentPlayer === 1 ? 'Black' : 'White';
        messageDiv.textContent = `${color}'s turn`;
    }
}

async function updateWinRates() {
    const currentBoard = history[history.length - 1];
    const legalMoves = new Node(currentBoard).getLegalMoves();

    for (let col = 0; col < COLS; col++) {
        const winRateSpan = document.getElementById(`win-rate-${col}`);
        if (legalMoves.includes(col) && !gameOver) {
            winRateSpan.textContent = '...';
        } else {
            winRateSpan.textContent = ' ';
        }
    }

    if (gameOver || legalMoves.length === 0) return;

    await new Promise(resolve => setTimeout(resolve, 10));

    const MCTS_ITERATIONS = 10000; 
    const rootNode = await mcts(new Board(currentBoard), MCTS_ITERATIONS * legalMoves.length);

    for (const child of rootNode.children) {
        let move = -1;
        for (let c = 0; c < COLS; c++) {
            if (child.board.column_heights[c] !== rootNode.board.column_heights[c]) {
                move = c;
                break;
            }
        }

        if (move !== -1) {
            const winRateSpan = document.getElementById(`win-rate-${move}`);
            const winRate = child.visits > 0 ? child.wins / child.visits : 0;
            winRateSpan.textContent = `${(winRate * 100).toFixed(1)}%`;
        }
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
