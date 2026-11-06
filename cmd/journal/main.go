package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/liugangdao/journal/internal/api"
	"github.com/liugangdao/journal/internal/store"
	"github.com/liugangdao/journal/web"
)

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func run() error {
	token := os.Getenv("JOURNAL_TOKEN")
	if token == "" {
		return errors.New("未设置 JOURNAL_TOKEN，拒绝启动")
	}
	st, err := store.Open(envOr("JOURNAL_DB", "./journal.db"))
	if err != nil {
		return err
	}
	defer func() {
		if err := st.Close(); err != nil {
			log.Printf("关闭数据库失败：%v", err)
		}
	}()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	server := &http.Server{
		Addr:              envOr("JOURNAL_ADDR", "127.0.0.1:8800"),
		Handler:           api.New(st, token, web.FS),
		ReadHeaderTimeout: 10 * time.Second,
	}
	result := make(chan error, 1)
	go func() { result <- server.ListenAndServe() }()
	log.Printf("交易日志监听地址：%s", server.Addr)
	select {
	case err := <-result:
		return err
	case <-ctx.Done():
		log.Print("收到停止信号，正在关闭服务")
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdown); err != nil {
			_ = server.Close()
			return errors.New("服务未能在期限内正常关闭")
		}
		if err := <-result; err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	}
}

func main() {
	if err := run(); err != nil {
		log.Fatalf("交易日志启动或运行失败：%v", err)
	}
}
