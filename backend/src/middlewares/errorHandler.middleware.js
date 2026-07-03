const errorHandler = (error, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  console.error("Server Error:", error.message || error);

  res.status(statusCode).json({
    success: false,
    message: error?.message || "Internal Server Error",
  });
};

export default errorHandler;
