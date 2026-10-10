//go:build windows

package main

import (
	"crypto/sha256"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

var kernel = syscall.NewLazyDLL("kernel32.dll")
var createMutex = kernel.NewProc("CreateMutexW")
var createJob = kernel.NewProc("CreateJobObjectW")
var setJob = kernel.NewProc("SetInformationJobObject")
var assignJob = kernel.NewProc("AssignProcessToJobObject")
var terminateJob = kernel.NewProc("TerminateJobObject")
var openProcess = kernel.NewProc("OpenProcess")
var shellExecute = syscall.NewLazyDLL("shell32.dll").NewProc("ShellExecuteW")

type basicLimit struct {
	PerProcessUserTimeLimit int64
	PerJobUserTimeLimit     int64
	LimitFlags              uint32
	MinimumWorkingSetSize   uintptr
	MaximumWorkingSetSize   uintptr
	ActiveProcessLimit      uint32
	Affinity                uintptr
	PriorityClass           uint32
	SchedulingClass         uint32
}
type ioCounters struct {
	ReadOperationCount  uint64
	WriteOperationCount uint64
	OtherOperationCount uint64
	ReadTransferCount   uint64
	WriteTransferCount  uint64
	OtherTransferCount  uint64
}
type extendedLimit struct {
	Basic                 basicLimit
	IO                    ioCounters
	ProcessMemoryLimit    uintptr
	JobMemoryLimit        uintptr
	PeakProcessMemoryUsed uintptr
	PeakJobMemoryUsed     uintptr
}

func lockInstance(data string) (func(), bool, error) {
	name, _ := syscall.UTF16PtrFromString(fmt.Sprintf("Local\\PTEStudy-%x", sha256.Sum256([]byte(data))))
	h, _, err := createMutex.Call(0, 0, uintptr(unsafe.Pointer(name)))
	if h == 0 {
		return nil, false, err
	}
	if err == syscall.Errno(183) {
		syscall.CloseHandle(syscall.Handle(h))
		return func() {}, false, nil
	}
	return func() { syscall.CloseHandle(syscall.Handle(h)) }, true, nil
}
func startOwned(cmd *exec.Cmd, control io.WriteCloser) (func(), error) {
	job, _, err := createJob.Call(0, 0)
	if job == 0 {
		return nil, err
	}
	limits := extendedLimit{}
	limits.Basic.LimitFlags = 0x2000
	ok, _, err := setJob.Call(job, 9, uintptr(unsafe.Pointer(&limits)), unsafe.Sizeof(limits))
	if ok == 0 {
		syscall.CloseHandle(syscall.Handle(job))
		return nil, err
	}
	if err = cmd.Start(); err != nil {
		syscall.CloseHandle(syscall.Handle(job))
		return nil, err
	}
	process, _, err := openProcess.Call(0x0100|0x0001, 0, uintptr(cmd.Process.Pid))
	if process == 0 {
		cmd.Process.Kill()
		syscall.CloseHandle(syscall.Handle(job))
		return nil, err
	}
	ok, _, err = assignJob.Call(job, process)
	syscall.CloseHandle(syscall.Handle(process))
	if ok == 0 {
		cmd.Process.Kill()
		syscall.CloseHandle(syscall.Handle(job))
		return nil, err
	}
	var once sync.Once
	return func() {
		once.Do(func() {
			control.Write([]byte{2})
			control.Close()
			time.Sleep(3 * time.Second)
			terminateJob.Call(job, 1)
			syscall.CloseHandle(syscall.Handle(job))
		})
	}, nil
}
func notifyTermination(chan os.Signal) {}
func openBrowser(url string) error {
	verb, _ := syscall.UTF16PtrFromString("open")
	target, _ := syscall.UTF16PtrFromString(url)
	result, _, err := shellExecute.Call(0, uintptr(unsafe.Pointer(verb)), uintptr(unsafe.Pointer(target)), 0, 0, 1)
	if result <= 32 {
		return err
	}
	return nil
}
